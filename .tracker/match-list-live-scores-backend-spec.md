# Match List Live Scores Backend Specification

## Status and Scope

Implemented backend contract. Frontend presentation and polling behavior are specified separately in `match-list-live-scores-frontend-spec.md`.

The backend supplies paginated initial score projections and bounded polling under the existing active-first, newest-first ordering. A list page defaults to 5 Matches and permits at most 20. It intentionally uses bounded batch reads rather than one live connection per Active Match. Individual Match pages retain the versioned live transport specified in `match-live-websocket-spec.md`.

This slice does not change scoring semantics, command transport, persistence authority, Match completion ordering, or the live behavior of an individual Match page. It does not introduce a shared live-match index, active-score mirror in D1, cross-Durable-Object publication, or browser subscription per list row.

## Authority

The list score is a projection, not an authority:

- MatchRoom remains authoritative for Active Match state.
- D1 remains authoritative for Match catalog data and completed archives.
- Accepted Command sequence identifies the active or final state represented by a score projection.
- The compact finished score stored on the D1 Match row is a durable list projection derived from canonical Final Match State.

## Shared Score Projection

Add a browser-safe Valibot schema to `@ks/core`, beside the existing Match state contracts. Its inferred type has the same name as the schema.

```ts
export const ActiveFrameScoreProjection = v.pipe(
  v.object({
    frameIndex: PositiveInteger,
    pointsBySeat: BySeatNumber,
  }),
  v.readonly(),
)
export type ActiveFrameScoreProjection = v.InferOutput<typeof ActiveFrameScoreProjection>

export const MatchScoreProjection = v.pipe(
  v.object({
    matchTargetFrames: PositiveInteger,
    framesWonBySeat: BySeatNumber,
    singleFramePointsBySeat: v.nullable(BySeatNumber),
    activeFrame: v.nullable(ActiveFrameScoreProjection),
  }),
  v.readonly(),
)
export type MatchScoreProjection = v.InferOutput<typeof MatchScoreProjection>
```

Reuse these existing core contracts:

- `MatchId` for identity;
- `BySeatNumber` for both Match and Frame scores;
- `PositiveInteger` for targets and Frame indexes;
- `NonNegativeInteger` for Accepted Command cursors;
- `MatchState` as the source from which the compact projection is derived.

Define one pure core function so active MatchRoom reads and finished D1 writes cannot interpret Frame state differently:

```ts
export function projectMatchScore(state: MatchState): MatchScoreProjection
```

The function selects an active Frame only when the Match is active and the Frame at `currentFrameIndex` has no `winnerSeat`. It does not infer an active Frame solely from `currentFrameIndex`, because that index identifies the last completed Frame while the Match is between Frames.

`activeFrame` is `null` before the first Frame is prepared, between Frames, and after the Match finishes. A prepared but not yet commenced Frame is active and contains its initial score.

`singleFramePointsBySeat` is populated from the represented Frame when `matchTargetFrames` is `1`, including after completion, and is otherwise `null`. This preserves the final points needed for single-Frame Match rows without mislabeling the completed Frame as active or retaining general Frame history.

The projection excludes player identity, game-specific presentation, breaker, frame history, controls, Protocol, and timestamps.

## D1 Finished Score Projection

The current `matches` row does not contain score data. Final Match State currently exists only as `match_protocol_archives.state_json`, so using the existing archive reader would also decode and validate Protocol entries that the list does not need.

Add two nullable fields to `matches`:

```ts
finalSourceLatestSeq: integer('final_source_latest_seq')
finalScoreJson: text('final_score_json')
```

`markMatchFinished` receives the completion transfer's `sourceLatestSeq` and `projectMatchScore(finalState)`. It stores both fields in the same D1 update that changes status to `finished` and stores `endedAt`. An idempotent retry verifies that an existing finished row has the same lifecycle and score values.

The D1 adapter parses `finalSourceLatestSeq` with `NonNegativeInteger` and `finalScoreJson` with `v.pipe(v.string(), v.parseJson(), MatchScoreProjection)`. A finished row requires both values; a creating or active row requires neither. A finished projection must have `activeFrame: null`; a finished single-Frame projection retains that Frame's final points in `singleFramePointsBySeat`. Violations are persisted-data defects, not partial list entries.

The completed archive's Final Match State remains canonical and can reproduce this projection. Active scores are never written to D1.

## MatchRoom Read Contract

Add `getScore()` to `MatchRoom` and to application's private `MatchRoomClient` capability.

```ts
type ActiveMatchScoreResult = Readonly<{
  _tag: 'active'
  latestSeq: NonNegativeInteger
  score: MatchScoreProjection
}>

type MatchRoomScoreResult = ActiveMatchScoreResult | Readonly<{ _tag: 'finalizing' }>
```

The active handler derives `score` from the same coherent resident projection used by `getControls()` and `getProtocol()`. `latestSeq` and `score` describe the same restored or resident state. The method does not return the full Match state.

The finalizing handler returns `finalizing`; it does not expose a second active representation of terminal state. Application handles that result through the existing idempotent archive-and-finish orchestration.

This RPC boundary remains trusted and typed. It does not reparse the score solely because the call crosses Cloudflare RPC.

## Application Contracts

Extend `MatchListEntry` with the version represented by the row and its score projection:

```ts
export type MatchListEntry = Readonly<{
  matchId: MatchId
  gameKey: RegisteredGameKey
  shortGameTitle: string
  status: 'active' | 'finished'
  createdAt: UnixEpochMilliseconds
  participants: HydratedMatchParticipants
  latestSeq: NonNegativeInteger
  score: MatchScoreProjection
}>
```

List pagination is offset-based and bounded at the application boundary:

```ts
export const MATCH_LIST_DEFAULT_PAGE_SIZE = 10
export const MATCH_LIST_MAX_PAGE_SIZE = 20

export const MatchListPagination = v.pipe(
  v.object({
    page: v.optional(PositiveInteger, 1),
    pageSize: v.optional(
      v.pipe(PositiveInteger, v.maxValue(MATCH_LIST_MAX_PAGE_SIZE)),
      MATCH_LIST_DEFAULT_PAGE_SIZE,
    ),
  }),
  v.check(({ page, pageSize }) => Number.isSafeInteger((page - 1) * pageSize)),
  v.readonly(),
)
export type MatchListPagination = v.InferOutput<typeof MatchListPagination>

export type MatchListPage = Readonly<{
  matches: readonly MatchListEntry[]
  page: PositiveInteger
  pageSize: PositiveInteger
  hasNextPage: boolean
}>

listMatches(locale: SupportedLocale, pagination?: MatchListPagination): Promise<MatchListPage>
```

The D1 adapter orders by lifecycle, descending creation time, and descending Match ID as a deterministic tie-breaker, then applies offset and limit. Application requests one extra row to derive `hasNextPage`, but hydrates participants and reads MatchRoom scores only for the returned page.

Define the polling entry once as a Valibot schema and inferred type. Add the response schema at the same application boundary:

```ts
export const MatchScorePollEntry = v.pipe(
  v.object({
    matchId: MatchId,
    status: v.picklist(['active', 'finished']),
    latestSeq: NonNegativeInteger,
    score: MatchScoreProjection,
  }),
  v.readonly(),
)
export type MatchScorePollEntry = v.InferOutput<typeof MatchScorePollEntry>

export const MatchScorePollResponse = v.pipe(
  v.object({
    matches: v.pipe(v.array(MatchScorePollEntry), v.maxLength(20), v.readonly()),
  }),
  v.readonly(),
)
export type MatchScorePollResponse = v.InferOutput<typeof MatchScorePollResponse>

export type ReadMatchScoresResult =
  | Readonly<{ ok: true; matches: readonly MatchScorePollEntry[] }>
  | ReadMatchFailure

readMatchScores(matchIds: readonly MatchId[]): Promise<ReadMatchScoresResult>
```

The operation accepts at most 20 unique Match IDs. The HTTP route enforces that external limit; duplicate or excessive values reaching application are caller defects and must not cause unbounded fan-out.

Application resolves each requested Match according to D1 lifecycle:

- `active`: call the selected MatchRoom's `getScore()`;
- `finished`: read `finalSourceLatestSeq` and `finalScoreJson` directly from the D1 Match row;
- `creating`: invariant violation for a Match exposed by the list;
- unknown: return a `ReadMatchFailure` with status `404` for the whole request;
- MatchRoom `finalizing`: run existing idempotent completion orchestration, then return the finished projection from the updated Match row.

The operation returns entries in request order and runs independent Active MatchRoom reads in parallel. An unexpected D1, archive, or MatchRoom defect fails the operation.

D1 loads the requested Match rows and their finished score fields in one `IN` query rather than calling `getMatchRow` once per Match. This is query batching inside the existing application-owned D1 adapter, not a generic repository abstraction.

## HTTP Polling Contract

Add a React Router resource route owned by Play:

```text
GET /api/sparring-matches/scores/?matchId=:id&matchId=:id...
```

The route:

1. accepts only `GET`;
2. requires between 1 and 20 `matchId` parameters;
3. validates each value with `MatchId`;
4. rejects duplicate IDs;
5. calls `Application.readMatchScores`;
6. adapts unknown Matches to `404`, invalid input to `400`, and unexpected defects to `500`;
7. returns `{ matches }` with `Cache-Control: no-store`.

The application `ok` discriminator is not part of the successful HTTP envelope. `MatchScorePollResponse` is exported for browser validation because HTTP JSON is an external representation boundary.

The poll contains only IDs, lifecycle, versions, and scores. It does not reload participant names, game titles, finished history, or route-level presentation data.

## Initial Page Call Stack

```text
Browser navigation
  -> React Router Sparring Match list loader
     -> parse optional positive page and pageSize query parameters
     -> Application.listMatches(locale, pagination)
        -> D1: read one bounded page plus one row for hasNextPage
        -> hydrate participants only for the returned page
        -> for each Active Match, in parallel
           -> MATCH_ROOM.getByName(matchId).getScore()
              -> MatchRoom active handler
                 -> restore resident Match from Accepted Commands when needed
                 -> project MatchState
                 -> projectMatchScore(state)
                 -> { latestSeq, score }
        -> for each finished Match
           -> D1 Match row finalSourceLatestSeq and finalScoreJson
        -> if an active D1 row has a finalizing MatchRoom
           -> run existing archive-and-finish orchestration
           -> use the resulting finished D1 Match row
        -> MatchListPage
     -> server-render rows with complete initial scores
```

The list defaults to page 1 with 5 rows and accepts a page size up to 20. If a required initial score cannot be read or finalized, the loader fails; there is no partial list-entry contract.

## Poll Call Stack

```text
GET /api/sparring-matches/scores/?matchId=...
  -> route parses and validates 1..20 unique Match IDs
  -> Application.readMatchScores(matchIds)
     -> D1: batch-read lifecycle and finished scores for requested IDs
     -> active arms: parallel MatchRoom.getScore() RPCs
     -> finished arms: use score fields from the Match rows
     -> finalizing arm: archive and finish, then read updated Match row
     -> { ok: true, matches: ordered MatchScorePollEntry[] }
  -> route returns { matches } with Cache-Control: no-store
```

A successful response contains replacement projections, not scoring deltas. Each entry is coherent for one Match; the batch is not a simultaneous snapshot across MatchRooms.

## Command and Completion Call Stacks

Ordinary scoring does not publish directly to the list:

```text
Individual Match control action
  -> Play action
  -> Application.submitMatchCommand(...)
  -> MatchRoom.submitCommand(...)
     -> execute Command
     -> atomically persist Accepted Command and latestSeq
     -> advance resident state

Later list poll
  -> MatchRoom.getScore()
  -> one current replacement projection containing all intervening changes
```

Completion preserves the existing ordering:

```text
Match-completing Accepted Command
  -> MatchRoom atomically stores Final Match State, endedAt, and finalizing status
  -> Application obtains canonical completion transfer
  -> Application archives Protocol and Final Match State in D1
  -> MatchRoom publishes terminal individual-page update and closes live clients
  -> Application marks D1 Match finished and stores final score projection

Later list read
  -> D1 reports finished
  -> Application reads final score fields from the Match row
```

If a list read encounters a D1-active row whose MatchRoom is finalizing, it resumes the same idempotent completion path before responding. It does not invent an Active score or return retained finalizing storage as a finished authority.

## Failure and Consistency Guarantees

- A successful read returns one complete current projection per Match; missing intermediate scores do not affect correctness.
- Accepted Command sequence lets the frontend reject an older projection.
- Unknown requested Match IDs fail explicitly; omission never means completion.
- Finished list scores come only from the compact projection on the D1 Match row. Finished reads do not parse Protocol or access retained MatchRoom storage.
- Active scores are never persisted into the D1 `matches` table.

## Backend Implementation Slices

1. Add the shared score projection and derivation.
2. Add finished score fields to D1 Match rows and populate them during `markMatchFinished`.
3. Add MatchRoom `getScore()` and application lifecycle routing for initial and batched score reads.
4. Extend list loader data with scores and bounded pagination without changing list presentation.
5. Add the bounded score resource route and response schema.

New automated coverage remains subject to `AGENTS.md`: update existing tests required by the changes, and seek approval before adding focused regression test files or materially expanding a suite.

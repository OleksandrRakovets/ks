# Current Architecture

## Runtime

```text
Browser
  -> Play Worker (React Router and React)
       -> @ks/application
            -> D1
            -> external MATCH_ROOM binding
                 -> ks-match-room Worker
                      -> named MatchRoom Durable Object
                           -> per-match SQLite
```

Play owns HTTP and presentation adaptation. `@ks/application` owns use-case orchestration, private D1 access, active-versus-finished read routing, and cross-store finalization. MatchRoom owns serialized active-match execution, persistence, replay, and SSE fan-out.

Play and MatchRoom are independently built Cloudflare Workers. MatchRoom has no public `fetch` gateway and no D1 binding; Play reaches it through an external Durable Object binding. Play and application import `@ks/match-room` type-only: application derives its private capability from the server class, and Play's generated binding verifies that the selected RPC stub is structurally compatible.

## Domain Boundaries

The domain dependency direction is:

```text
core <- gameplay <- competition
```

- `core` defines shared IDs, schemas, seats, Protocol values, and generic contracts.
- `gameplay` defines registered games, frame machines, commands, and control projections.
- `competition` defines sparring lifecycle, match execution, restoration, and room projection.
- `application` and MatchRoom consume the domain independently; neither depends on the other.

Game keys come from `packages/gameplay/src/registry.ts`. Each game has explicit control and protocol routes. Commands share the `game` path, while gameplay owns their semantics.

## Data Authority

| Store | Authority |
| --- | --- |
| D1 | Players, match rows and status, completed protocol archive and final match state |
| MatchRoom SQLite | Active config, control secret, Accepted Commands and outcomes, normalized Protocol entries, monotonic sequence, terminal Final Match State, active/finalizing status |

Accepted Commands are the active replay authority and are never mirrored to D1. A resident `SparringMatch` is only a disposable execution cache. Cold restoration validates ordered command rows and their Protocol rows, replays each command through the same aggregate operation, and compares canonical semantic Protocol values. Raw XState snapshots are not persisted.

An accepted command advances resident state before one SQLite transaction stores the command, its Protocol rows, the next sequence, and any terminal state/status. Execution or persistence defects discard the resident cache so the next operation restores from durable commands.

Finished match-state and Protocol reads use D1 only. Final Match State is persisted atomically with terminal acceptance and transferred with Protocol without application-side gameplay replay.

## Match Lifecycle

Creation is coordinated by application:

```text
D1 matches.status: creating
  -> MatchRoom.create persists config and match.created
  -> D1 matches.status: active
```

Ordinary commands verify the match row's lifecycle, then write only to MatchRoom. `commandId` receipts make retries idempotent and reject reuse with a different canonical request.

`match.ended` is committed atomically with MatchRoom's `finalizing` status and withheld from live clients until archival succeeds:

```text
MatchRoom finalizing Protocol + Final Match State
  -> application validates transfer identity and terminal consistency
  -> idempotently archive protocol and final match state in D1
  -> MatchRoom broadcasts match.ended, closes streams, and deletes local storage
  -> D1 matches.status: finished
```

Failure leaves durable `finalizing` state. A later relevant application request retries the idempotent finalization steps. There is no alarm-driven retry. Public list results present `finalizing` as finished while cleanup proceeds.

The generated control secret is stored in MatchRoom but is not exposed or checked by the current command path.

## Live Updates

```text
Browser EventSource
  -> Play /api/m/:matchId/stream/ loader
  -> application lifecycle check and Response pass-through
  -> MatchRoom.stream
  -> replay atomic Accepted Command updates after cursor
```

The browser validates events and tracks the latest sequence. MatchRoom retains stream controllers and 25-second ping timers, so connected clients keep the Durable Object active; the current SSE transport is not hibernatable.

## Persistence Boundaries

- Canonical schemas are `packages/application/src/d1/schema.ts` and `do/match-room/src/storage/schema.ts`.
- D1 and MatchRoom SQLite have independent migration histories and application mechanisms.
- Persisted JSON, commands, and Protocol rows are decoded and validated in their owning adapters. Malformed data fails the operation rather than yielding partial state.
- MatchRoom SQLite uses positive Accepted Command sequence for ordering, beginning at `1`; newly created matches have cursor `0`.
- See `.tracker/db.md` for migration and inspection procedures.

## Deployment

Both Workers use compatibility date `2026-08-11`. Deploy MatchRoom before Play because Play binds its namespace through `script_name: "ks-match-room"`. The project has not yet been deployed, so both initial migration histories still represent clean baselines.

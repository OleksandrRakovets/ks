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
- `gameplay` defines registered games, frame machines, commands, and coherent derivation of separate game presentation and flat controls.
- `competition` defines sparring lifecycle, match execution, restoration, and room projection.
- `application` and MatchRoom consume the domain independently. Application has only a type-only dependency on MatchRoom for its private RPC capability.

Game keys come from `packages/gameplay/src/registry.ts`. Each game has explicit control and protocol routes. Commands share the `game` path, while gameplay owns their semantics.

Competition composes match controls before game controls into one flat list. MatchRoom returns each coherent resident projection as match state, optional correlated game presentation, and flat controls. Application preserves those shapes and lifecycle arms; Play alone groups controls into stable presentation sections for layout. MatchRoom RPC is a trusted typed capability and does not reparse these values at that seam.

### Schema Conventions

- A Valibot schema and its inferred output type share the same name; do not add a `Schema` suffix.
- Domain values such as commands, Protocol entries, game state, and projections are readonly. Construction may use mutable locals, with readonly established at the validated or returned boundary rather than through extra copying.
- Use non-empty tuple schemas when non-emptiness is part of the domain contract. Use strict objects for closed variants and internal state shapes; keep stripping objects at persisted, wire, and browser-storage boundaries where forward compatibility is intentional.

## Data Authority

| Store | Authority |
| --- | --- |
| D1 | Players, match rows and status, completed protocol archive and final match state |
| MatchRoom SQLite | Active config, control secret, Accepted Commands and outcomes, monotonic sequence, terminal Final Match State, active/finalizing status |

Accepted Commands are the active replay authority and are never mirrored to D1. A shared resident is only a disposable execution and Protocol cache. Cold restoration validates ordered command rows and replays each command through the same aggregate operation to derive Protocol. Raw XState snapshots are not persisted.

MatchRoom owns MatchStorage, Broadcaster, and exactly one stateful lifecycle handler. ActiveMatchHandler owns the current Stored Active Match and its ResidentMatch; terminal acceptance replaces it immediately with FinalizingMatchHandler and passes the current resident forward. After eviction, MatchRoom reads durable status once to reconstruct the appropriate handler. Cold active reconstruction restores accepted history immediately, while cold finalizing reconstruction remains replay-free until archive preparation.

Gameplay compatibility risk therefore extends through `prepareArchive`: finalizing history must remain replayable until that semantic validation gate has produced the D1 transfer. Finalize and stream closure are deliberately replay-free after archive preparation.

An accepted command advances resident state before one synchronous SQLite transaction stores the Accepted Command, next sequence, and any terminal state/status. MatchRoom does not persist Protocol; the shared resident atomically publishes match state, cursor, and promoted entries. Execution, persistence, or promotion defects discard the cache so the next operation restores from durable commands.

Finished match-state and Protocol reads use D1 only. Final Match State is persisted atomically with terminal acceptance and transferred with Protocol without application-side gameplay replay.

## Match Lifecycle

Creation is coordinated by application:

```text
D1 matches.status: creating
  -> MatchRoom.initialize persists config and match.created
  -> D1 matches.status: active
```

Ordinary commands verify the match row's lifecycle, then write only to MatchRoom. `commandId` receipts make retries idempotent and reject reuse with a different canonical request. A valid Command envelope whose nested match/game command is unsupported returns `invalid-command`; malformed browser input remains an expected HTTP failure rather than an RPC exception.

Application selects a named room once with `getByName(matchId)`. Initialization verifies that the routed Durable Object name equals the input Match ID, persists configuration idempotently, and reports conflicting configuration as `initialization-conflict`. Later RPC methods derive identity from the selected room and do not repeat the Match ID. Resident gameplay state is created lazily by the first active operation.

Command retry equality compares decoded canonical values rather than serialized JSON. Identical accepted and rejected retries return their durable outcome. Reusing an ID with different content returns `command-id-conflict`. After finalization, retrying the terminal Accepted Command still reports `finalizesMatch: true`; retrying an earlier Accepted Command reports `false`.

`match.ended` is committed atomically with MatchRoom's `finalizing` status and withheld from live clients until archival succeeds:

```text
MatchRoom finalizing Protocol + Final Match State
  -> application treats the transfer as canonical and checks D1 identity, lifecycle, and archive idempotency
  -> idempotently archive protocol and final match state in D1
  -> MatchRoom broadcasts match.ended, closes streams, and schedules delayed disposal
  -> D1 matches.status: finished
  -> MatchRoom alarm deletes local storage after 10 minutes
```

Failure before D1 reaches `finished` leaves durable `finalizing` state. A later relevant application request retries the idempotent archival and finalization steps. Public list results present D1 `finalizing` as finished while that work proceeds.

MatchRoom's `finalizing` status is not durable from the application's perspective: the disposal alarm erases it after the grace period. D1's `finalizing` status is the durable completion marker that outlives room disposal, letting a request arriving after disposal still call the room's idempotent `finalize()` and mark D1 finished. Reconciliation keys off D1 first and the room second. Removing D1 `finalizing` would wedge a match if its Play request crashed between `finalize()` and `finishCompletedMatch()`.

Finalization publishes the withheld terminal update, closes clients, schedules one Cloudflare alarm 10 minutes in the future, and clears resident state. Application marks D1 finished only after finalization returns. Finalization retries do not extend the existing alarm, and retained `finalizing` storage continues to serve semantic finalizing results and idempotent archive transfers during the grace period. The alarm is the sole destructive path: it validates that the room is finalizing, deletes all local storage, and tolerates already-missing storage.

FinalizingMatchHandler owns every finalizing operation, including validation and in-memory cleanup before disposal. Command retries consult durable receipts, while controls, Protocol, stream, finalize, and disposal are replay-free. Only `prepareArchive` may restore accepted history after resident eviction, because it owns the terminal semantic gate; a warm transition reuses the active resident without rereading history. Finalize does not depend on proof that archive preparation previously ran. MatchRoom retains the visible platform boundary: it schedules the alarm after finalization and calls `deleteAll()` only after the finalizing handler prepares disposal.

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

Existing streams remain connected while archival is pending. A new stream request against a Finalizing Match returns `finalizing` instead of opening another stream, allowing application to resume archival. Terminal delivery remains withheld until finalization after archive success; delayed disposal gives closed clients time to revalidate against D1's finished representation.

## Persistence Boundaries

- Canonical schemas are `packages/application/src/d1/schema.ts` and `do/match-room/src/storage/schema.ts`.
- D1 and MatchRoom SQLite have independent migration histories and application mechanisms.
- Persisted JSON and commands are decoded and validated in their owning adapters. Derived Protocol and archive semantics are validated through archive preparation. Malformed data fails the operation rather than yielding partial state.
- MatchRoom SQLite uses positive Accepted Command sequence for ordering, beginning at `1`; newly created matches have cursor `0`.
- `MatchStorage` owns migration access, the Drizzle client, persisted representations, codecs, and consistency checks. Rows and serialized JSON do not cross its public seam; it persists commands and lifecycle only.
- Storage validation enforces Accepted Command shape, sequence continuity, command identity, Match identity, timestamps, and lifecycle. MatchStorage does not import or interpret gameplay semantics. ResidentMatch reconstructs Protocol metadata and indices; `prepareArchive` checks that the replayed final state agrees with the atomically persisted Final Match State.
- Constructor migration runs in `blockConcurrencyWhile`, so no RPC event observes an unmigrated room. Active operations remain synchronous over resident state and SQLite. Finalization blocks concurrency while publishing the terminal update, closing streams, and scheduling cleanup. Alarm disposal separately blocks concurrency while validating lifecycle and calling `deleteAll()`.
- Expected RPC outcomes are semantic variants, not HTTP failures. Application owns HTTP adaptation. Missing or corrupt authority and invalid lifecycle calls are defects that throw.
- See `.tracker/db.md` for migration and inspection procedures.

## Deployment

Both Workers use compatibility date `2026-08-11`. Deploy MatchRoom before Play because Play binds its namespace through `script_name: "ks-match-room"`. The project has not yet been deployed, so both initial migration histories still represent clean baselines.

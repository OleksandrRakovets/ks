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

Play owns HTTP and presentation adaptation. `@ks/application` owns use-case orchestration, private D1 access, active-versus-finished read routing, and cross-store finalization. MatchRoom owns serialized active-match execution, persistence, replay, and hibernatable WebSocket fan-out.

Play and MatchRoom are independently built Cloudflare Workers. MatchRoom has no public route or D1 binding; its `fetch` method serves only WebSocket handshakes forwarded to a selected object by Play. Play reaches it through an external Durable Object binding. Play and application import `@ks/match-room` type-only: application derives its private capability from the server class, and Play's generated binding verifies that the selected RPC stub is structurally compatible.

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
| D1 | Players, creating/active/finished match rows, completed protocol archive and final match state |
| MatchRoom SQLite | Active config, control secret, Accepted Commands and outcomes, monotonic sequence, terminal Final Match State, active/finalizing status |

Accepted Commands are the active replay authority and are never mirrored to D1. Resident match state and derived Protocol are disposable caches; cold restoration validates and replays ordered commands through the same aggregate operation. Raw XState snapshots are not persisted.

Active restoration replays Accepted Commands after eviction. Finalizing paths remain replay-free except when `prepareArchive` derives Protocol and verifies the replayed Final Match State, so gameplay compatibility must be preserved through archive preparation.

An accepted command advances gameplay before one synchronous SQLite transaction stores the Accepted Command and next sequence. When it completes the Match, that transaction also stores Final Match State and the `finalizing` status. Resident state and derived Protocol advance only after the commit; defects discard the cache so the next operation restores from durable commands.

Finished match-state and Protocol reads use D1 only. Final Match State is persisted atomically with the match-completing acceptance and transferred with Protocol without application-side gameplay replay.

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
  -> MatchRoom broadcasts match.ended and closes streams
  -> D1 matches.status: active -> finished, storing endedAt
```

Until the final step succeeds, D1 remains active and the retained MatchRoom reports `finalizing`; a later relevant application request then retries the idempotent transfer, archival, and finalization steps. Finalization publishes the withheld terminal update, closes clients, and clears resident state without replaying history. Finished reads use D1 and do not access MatchRoom. Cleanup of retained finalizing storage is deferred until observed costs justify a separate retention mechanism.

The generated control secret is stored in MatchRoom but is not exposed or checked by the current command path.

## Live Updates

```text
Browser WebSocket
  -> Play /api/sparring-match/:matchId/live/ Worker gateway
  -> application transport-neutral D1 admission
  -> selected MatchRoom.fetch WebSocket handshake
  -> caught-up cursor, then committed Accepted Command invalidations
```

The browser validates the versioned shared wire contract and reconnects with bounded backoff. Loader projections remain authoritative: live messages only request revalidation. A connection receives one current cursor rather than replaying individual invalidations.

MatchRoom uses only the Durable Object Hibernation API for connected sockets and reconstructs connection metadata from serialized attachments. A new connection against a Finalizing Match returns `410`. Terminal delivery remains withheld until finalization after archive success; MatchRoom then broadcasts the completing update and closes sockets with the shared completion code so clients revalidate against D1's finished representation.

## Persistence Boundaries

- Canonical schemas are `packages/application/src/d1/schema.ts` and `do/match-room/src/storage/schema.ts`.
- D1 and MatchRoom SQLite have independent migration histories and application mechanisms.
- Persisted rows and JSON are decoded and validated at the storage boundary. Malformed data fails the operation rather than yielding partial state.
- MatchRoom SQLite uses positive Accepted Command sequence for ordering, beginning at `1`; newly created matches have cursor `0`.
- `MatchStorage` owns persisted representations and consistency checks without interpreting gameplay semantics. It exposes decoded matches and Accepted Commands, while the match layer derives Protocol.
- Constructor migration runs in `blockConcurrencyWhile`, so no RPC event observes an unmigrated room.
- Expected RPC outcomes are semantic variants, not HTTP failures. Application owns HTTP adaptation. Missing or corrupt authority and invalid lifecycle calls are defects that throw.
- See `.tracker/db.md` for migration and inspection procedures.

## Deployment

Both Workers use compatibility date `2026-08-11`. Deploy MatchRoom before Play because Play binds its namespace through `script_name: "ks-match-room"`. The project has not yet been deployed, so both initial migration histories still represent clean baselines.

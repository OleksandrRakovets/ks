# MatchRoom Refactor Specification

## Status

Accepted on 2026-08-27. Implementation must follow the complete module layout, lifecycle ordering, trusted RPC interface, and executable test matrix in this specification; do not land an incomplete structural midpoint.

Implementation runs follow `.tracker/match-room-refactor-guide.md` for slice order, completion criteria, and user review gates.

## Goals

- Keep `MatchRoom` as the Cloudflare Durable Object composition root.
- Keep Cloudflare environment bindings and object identity handling in `MatchRoom`.
- Treat internal MatchRoom RPC as a trusted typed capability and pass canonical typed inputs directly to operators.
- Give operators canonical typed inputs so their implementations follow the happy path.
- Inject concrete capabilities directly; do not add generic interfaces for single implementations.
- Deepen existing modules before adding new seams.
- Preserve authority and lifecycle ordering from `.tracker/decisions/current-architecture.md`.

## Trusted RPC Decision

MatchRoom RPC is an implementation transport for calls between two deployables owned and versioned in this repository. It is treated like a typed call to the exported MatchRoom class, not as an external trust seam.

- TypeScript owns RPC argument and result compatibility.
- MatchRoom methods receive canonical typed values and do not reparse them with RPC-only schemas.
- Application does not maintain response-shape schemas or convert malformed RPC results to synthetic gateway failures.
- HTTP and other external callers validate before invoking application operations.
- Persisted rows and JSON remain untrusted representations and are validated when decoded.
- Restored machine state and browser-held data remain validation seams.
- Lifecycle and authority checks remain when they enforce behavior rather than representation shape.
- The deployment-coupling risk is accepted. MatchRoom is deployed before Play when the typed interface changes.

The final design deletes `MatchRoom.contract.test.ts` and the response-validation role of `match-room-client.ts`.

Application selects the Durable Object stub once with `MATCH_ROOM.getByName(matchId)`. The selected stub is the Match capability. Cloudflare exposes that routed name as `ctx.id.name` for KS's compatibility date. During initialization, MatchRoom requires `ctx.id.name === input.matchId` and treats an absent or mismatched name as a programming/configuration defect. This establishes capability-to-Match identity without calling the self namespace or persisting another identity record. Later RPC methods do not repeat `{ matchId }`; active and finalizing modules derive identity from `MatchStorage`.

The target exported RPC method set is:

```text
initialize(input)
getControls()
getProtocol()
submitCommand(command)
stream(since?)
prepareArchive()
dispose()
```

An accepted Command that finalizes the Match atomically moves MatchRoom to `finalizing` and returns `finalizesMatch: true`; it does not return archive data. Application then calls `prepareArchive()` to read the idempotent completion transfer. After persisting that transfer in D1, application calls `dispose()` to publish terminal delivery, close clients, and delete MatchRoom storage.

Expected Command and lifecycle outcomes use typed semantic variants. MatchRoom RPC does not return HTTP-shaped `{ ok, error, status }` failures; application owns HTTP adaptation. Trusted RPC removes representation-error results, not behavioral recovery states. Cross-store races such as D1 reporting active after MatchRoom became finalizing remain explicit results so application can resume archival. Defects, impossible authority mismatches, persisted corruption, and infrastructure failures throw. Successful idempotent disposal has no payload requirement.

The result vocabulary uses domain and lifecycle tags such as `active`, `finalizing`, `accepted`, `rejected`, and `command-id-conflict`. It does not use transport phrases such as invalid body, gateway failure, HTTP status, or unknown Match after application has already selected an active D1 Match.

The result matrix is:

| RPC | Expected result |
| --- | --- |
| `initialize` | `initialized` or `initialization-conflict` |
| `getControls` | active projection or `finalizing` |
| `getProtocol` | active state and Protocol or `finalizing` |
| `submitCommand` | `accepted`, `rejected`, `command-id-conflict`, or `finalizing` |
| `stream` | active stream or `finalizing` |
| `prepareArchive` | completion transfer directly |
| `dispose` | `void`, idempotently |

An identical Command retry returns its original accepted or rejected result. Accepted results include `finalizesMatch: boolean`. MatchStorage derives the original value as `status === finalizing && acceptedSeq === latestSeq`; an older accepted Command retry remains `finalizesMatch: false` after the Match finalizes. Calling `prepareArchive` while active, or finding missing storage during an operation application believes is active, throws as a defect rather than adding a recoverable RPC variant.

## Technical Capabilities

`MatchStorage` and `Broadcaster` are object-instance technical capabilities, not Match lifecycle phases. MatchRoom constructs them once and injects them into lifecycle modules. Storage is authoritative while active or finalizing; broadcaster state is disposable delivery state.

## Agreed Module: MatchStorage

### Role

`MatchStorage` is the match-aware extension of Cloudflare's `DurableObjectStorage` capability. It owns the persisted representation and invariants of one active or finalizing Match.

The class is constructed with `DurableObjectStorage`. `MatchRoom` retains `blockConcurrencyWhile` and calls a migration operation on `MatchStorage`; the Drizzle client and migration bundle do not cross the storage seam.

MatchRoom invokes migration from constructor `blockConcurrencyWhile`. Cloudflare blocks delivery of every other event until that callback completes and resets the object if it fails. The target design has no `ready` promise and RPC methods do not redundantly await constructor readiness.

Initialization, active reads, live stream setup, and Command submission remain synchronous over in-memory state and Durable Object SQLite. They do not use `blockConcurrencyWhile`. Disposal retains it because `deleteAll()` is awaited and terminal broadcast, client closure, and deletion must remain ordered against other events. Any future external asynchronous I/O in an active operation must explicitly revisit ordering.

### Interface Shape

The interface is operation-shaped, not record-shaped CRUD. Operators pass canonical typed domain values and receive canonical typed results. Persisted rows, Drizzle values, and serialized JSON never cross the seam.

The required operation-shaped capabilities are:

- apply MatchRoom SQLite migrations;
- create the persisted Match from typed configuration, control secret, and creation time;
- read and validate the persisted Match lifecycle record;
- find a durable Command outcome and distinguish a semantically identical retry from Command ID reuse with different content;
- commit a rejected Command outcome;
- atomically commit an Accepted Command, its Protocol entries, sequence, and optional terminal Final Match State;
- read typed Protocol entries through an authoritative sequence;
- read typed Accepted Command history for resident restoration;
- read and verify the persisted finalizing transfer.

### Persisted Contract Knowledge

`MatchStorage` validates canonical persisted contracts at the representation seam:

- `MatchConfig` and `MatchState` identity and lifecycle consistency;
- `MatchCommand` JSON;
- the generic `ProtocolEntry` envelope;
- Accepted Command sequence continuity;
- Protocol entry indexes, Command ownership, and timestamps;
- terminal Protocol position, time, and winner consistency.

This is not gameplay restoration. Protocol bodies remain generic at this seam. `MatchStorage` must not execute Commands, restore `SparringMatch`, parse game-specific Protocol semantics, or produce projections. Resident restoration remains a competition/runtime responsibility. Application treats the completion transfer as canonical; before writing D1 it checks only D1 Match identity/lifecycle and idempotent archive conflicts. It does not reparse or revalidate Protocol entries or Final Match State received through trusted RPC.

### Explicit Non-Responsibilities

`MatchStorage` does not own:

- RPC transport or result adaptation;
- Durable Object namespace selection;
- `blockConcurrencyWhile`;
- resident `SparringMatch` state;
- gameplay execution or projection;
- SSE broadcast or stream bookkeeping;
- cross-store finalization orchestration;
- stream closure;
- `DurableObjectStorage.deleteAll()`;
- application or D1 access.

### Required Structural Changes

- Rename `ActiveMatchStore` to `MatchStorage`.
- Remove the public Drizzle `db` property.
- Move migration ownership behind the `MatchStorage` seam.
- Replace `configJson` and `requestJson` inputs with canonical typed values.
- Move durable Command request equality and stored outcome decoding into `MatchStorage`.
- Define durable Command retry equality over decoded canonical Command values, independent of JSON object property order. Serialized byte equality is not the contract.
- Allow `MatchStorage` to delegate row codecs, entity-specific persistence, and use-case-specific queries to private helpers in `storage/`. These helpers do not create additional public adapters or split the Accepted Command/Protocol transaction.
- Delete the shallow `storage/command-outcome.ts` implementation after its typed operation result has an appropriate owner.
- Remove `liveUpdatesAfter` from storage; it is a disposable live projection over authoritative sequence, not persistence.
- Replace `history(match)` with an operation that reads and validates its own authoritative cursor rather than accepting a previously exposed storage record.
- Keep Command and Protocol writes in one transaction. Do not split them into separate adapters.

## Agreed Lifecycle Modules

### Match Initialization

Match creation is separate from runtime migration. Migration is technical Durable Object bootstrap and runs on every object reconstruction before events are delivered.

The initialization operation:

- builds canonical Match configuration;
- enforces idempotent creation against persisted identity and configuration;
- records the new active Match through `MatchStorage`.

Initialization does not need to seed resident state. The first active operation may create or restore it transparently from persisted configuration and Accepted Command history.

Initialization lives in `match/initialize-match.ts` as a stateless operation receiving `MatchStorage` and canonical typed input. It is not a class: it has one operation and no resident state. MatchRoom delegates its `initialize` RPC after constructor migration has completed.

### ActiveMatch

One deep `ActiveMatch` module owns the complete active lifecycle and receives `MatchStorage` and `Broadcaster`.

It owns:

- transparent lazy resident initialization or restoration after Cloudflare eviction;
- active control projection;
- active Protocol reads;
- Command deduplication and finalizing gate;
- speculative Command execution;
- persistence coordination;
- resident cursor publication only after commit;
- resident invalidation after execution or persistence defects;
- live replay and non-terminal broadcast coordination.

Existing live clients may remain connected after terminal acceptance while D1 archival is pending. A new `stream()` call against a Finalizing Match returns a typed finalizing result rather than opening another stream. Application uses that result to resume archival. During explicit disposal after archive success, existing clients receive the withheld terminal update; clients should disconnect as soon as they process it, and Broadcaster proactively closes any that remain.

Callers never check whether resident state exists. A separate passive cache class is not introduced.

### FinalizingMatch

One `FinalizingMatch` module owns finalizing transfer verification and terminal delivery/closure:

- expose the verified persisted completion transfer for D1 archival;
- after application confirms archival by making an explicit disposal RPC call, publish the withheld terminal update, close live clients, and coordinate disposal.

Terminal acceptance itself occurs in the active Command transaction. That transaction atomically persists the terminal Accepted Command, Protocol entries, sequence, Final Match State, `endedAt`, and `finalizing` status. The room is therefore locked immediately even if application fails before requesting the completion transfer.

The terminal Command response reports that terminal acceptance occurred; it does not contain the archive transfer. Application obtains the transfer with a separate idempotent RPC call.

The explicit application disposal RPC performs one ordered MatchRoom operation:

1. publish the withheld terminal update;
2. close all live clients;
3. call `DurableObjectStorage.deleteAll()` directly from MatchRoom;
4. clear resident process state;
5. return success so application can mark the D1 Match finished.

MatchRoom coordinates the complete disposal order around those `FinalizingMatch` operations and its direct runtime deletion effect. Broadcast, close, and deletion are not split into separate RPC calls. A retry after interruption must converge idempotently, including reconstruction after storage was already deleted.

MatchRoom retains a resident `disposedAt` timestamp because same-instance retry after `deleteAll()` cannot query tables that no longer exist. If the timestamp is set, disposal succeeds immediately and may use it in diagnostics. MatchRoom sets it only after `deleteAll()` succeeds. After object reconstruction the timestamp is absent and constructor migration may have recreated empty schema tables; absence of a persisted Match is then treated as previously disposed, so MatchRoom calls `deleteAll()` again, records a new resident `disposedAt`, and succeeds. The timestamp is process metadata for idempotency and diagnostics, not durable Match authority or the Match end time.

### Composition Root

MatchRoom owns concrete instances of `MatchStorage`, `Broadcaster`, `ActiveMatch`, and `FinalizingMatch`. No generic interfaces are introduced for these single implementations.

- `initialize(input)` verifies `ctx.id.name` and invokes the stateless initialization operation with `MatchStorage`.
- `getControls()`, `getProtocol()`, `submitCommand(command)`, and `stream(since?)` proxy to `ActiveMatch`.
- `prepareArchive()` proxies to `FinalizingMatch`.
- `dispose()` blocks concurrency, asks `FinalizingMatch` to publish the terminal update and close clients, directly calls `ctx.storage.deleteAll()`, and clears `ActiveMatch` resident state.

`ActiveMatch` receives `MatchStorage` and `Broadcaster`, owns its private resident, and exposes only the four active operations plus an internal resident-clear operation for disposal. `FinalizingMatch` receives `MatchStorage` and `Broadcaster`, and exposes archive preparation plus an internal close-for-disposal operation. Neither receives `ctx`, `env`, or raw `DurableObjectStorage`.

## Target Layout

```text
do/match-room/src/
  MatchRoom.ts
  worker.ts
  env.ts
  match/
    initialize-match.ts
    active-match.ts
    finalizing-match.ts
  storage/
    match-storage.ts
    ... private row/entity/use-case helpers as needed
    schema.ts
  live/
    broadcaster.ts
```

`rpc-contract.ts` is removed. Typed declarations live with their original operation, and the exported `MatchRoom` class provides Cloudflare's RPC type surface. Behavioral integration specifications live outside `src/match` and call the exported RPC interface.

## Test Architecture

### MatchRoom RPC Integration

Cloudflare Vitest integration tests invoke the real final RPC methods through a real Durable Object stub. This is the executable specification for exported behavior:

```text
do/match-room/test/rpc/
  initialization.integration.test.ts
  active-match/
    get-controls.integration.test.ts
    get-protocol.integration.test.ts
    submit-command.integration.test.ts
    stream.integration.test.ts
  finalizing-match/
    prepare-archive.integration.test.ts
    dispose.integration.test.ts
  fixtures.ts

do/match-room/test/storage/
  match-storage.integration.test.ts
```

#### Initialization

- constructor migration completes before the first RPC operation;
- routed `ctx.id.name` must equal initialization Match ID;
- fresh initialization starts at Accepted Command sequence zero;
- identical initialization is idempotent;
- conflicting initialization returns `initialization-conflict`;
- reconstruction after eviction does not reinitialize the Match.

#### Active Match

- controls and Protocol are available at sequence zero;
- accepted Commands advance authoritative sequence and Protocol atomically;
- rejected Commands persist their outcome without advancing sequence;
- identical accepted and rejected retries return their original outcome, including after eviction;
- terminal accepted retries remain terminal while earlier accepted retries remain non-terminal after finalization;
- semantically identical retries ignore JSON object property order;
- Command ID reuse with different content returns `command-id-conflict`;
- concurrent Commands produce one monotonic accepted order;
- eviction restores resident state from typed Accepted Command history;
- persistence failure after speculative execution invalidates resident state before the next operation;
- terminal acceptance returns `finalizesMatch: true`, persists Final Match State, and makes later active calls return `finalizing`;
- impossible missing or corrupt active authority throws rather than returning an HTTP-shaped failure.

#### Finalizing Match

- `prepareArchive()` returns persisted Protocol and Final Match State without gameplay replay, including after eviction;
- `prepareArchive()` before terminal acceptance throws as a lifecycle defect;
- disposal before terminal acceptance throws;
- disposal publishes the withheld terminal update, closes clients, and deletes storage in order;
- same-instance disposal retry after successful deletion or a lost response succeeds from resident `disposedAt` state;
- disposal retry after deletion and eviction deletes migration-created storage again and succeeds;

#### Live Delivery

- replay sends accepted sequence updates in order before ready state;
- accepted non-terminal Commands broadcast to all connected clients;
- cancellation removes client resources;
- terminal acceptance is withheld before D1 archival;
- a new stream against a Finalizing Match returns `finalizing` and triggers application recovery;
- existing streams receive terminal delivery and close during disposal;
- replay establishment concurrent with Command acceptance loses or duplicates no sequence.

These tests should prefer observable RPC results and durable behavior over private module calls.

### MatchStorage Integration

One focused Cloudflare Vitest integration specification exercises `MatchStorage` with real `DurableObjectStorage` and SQLite. It owns:

- migration application without exposing the Drizzle client;
- canonical Match, Command, Protocol, and Final Match State encoding and decoding;
- durable Command request equality;
- Accepted Command and Protocol transaction atomicity;
- sequence, Protocol ownership/index/timestamp, lifecycle, and terminal bundle corruption detection;
- typed Accepted Command history and Protocol reads.

It does not execute gameplay or duplicate lifecycle behavior already specified through RPC.

### Trusted MatchRoom Capability

MatchRoom RPC is a private typed capability between the independently deployed Play and MatchRoom Workers. Cloudflare transport does not by itself make the call a trust seam. TypeScript owns argument and result compatibility; MatchRoom and application do not maintain duplicate runtime schemas for the same RPC values.

Application dependencies expose `matchRoomClient(matchId)`, which synchronously returns the selected Cloudflare stub narrowed to the private `MatchRoomClient` capability derived from the MatchRoom server class. The type-only dependency keeps RPC method types authoritative in MatchRoom without adding a runtime dependency. The production selector is equivalent to `bindings.MATCH_ROOM.getByName(matchId)`; it does not construct a forwarding object, parse responses, or adapt results. The selected client methods mirror MatchRoom and do not repeat Match ID arguments.

Application use cases call the selected capability directly, for example `matchRoomClient(matchId).submitCommand(command)`. Play only supplies the binding to the application factory and does not know about the private capability. Tests substitute the selector with typed fake selected clients. `match-room-client.ts` retains capability and namespace-selector types only and has no dedicated runtime test suite.

Application removes the RPC result schemas and game-specific Protocol reparsing from `match-room-client.ts`. Completed archival consumes the canonical transfer directly and removes the pre-archive Protocol/Final Match State consistency walker. It retains D1 Match identity/status checks, conflicting existing-archive detection, and validation when decoding JSON already persisted in D1.

The Play assembly passes its generated `DurableObjectNamespace<MatchRoom>` binding into application without an unchecked cast. TypeScript must prove that the selected generated stub is assignable to the private `MatchRoomClient` capability. The implementation must not use a type assertion to bypass this compile-time interface check.

Application use-case tests depend on the typed MatchRoom capability and test application orchestration. They do not restate MatchRoom behavior with mocked structural RPC results.

HTTP inputs, browser data, persisted rows and JSON, and restored machine state remain validation seams. Cross-store authority and lifecycle consistency checks also remain where they protect ordering or authoritative data; they are not RPC representation parsing.

### Current Test Disposition

- `do/match-room/src/MatchRoom.integration.test.ts`: evolve into the final RPC executable specification.
- `do/match-room/src/MatchRoom.contract.test.ts`: remove; TypeScript and final RPC integration own compatibility.
- `packages/application/src/match-room-client.test.ts`: remove with runtime RPC response parsing.
- `do/match-room/src/storage/command-outcome.test.ts`: remove with the shallow module; persisted outcome coverage moves to MatchStorage integration.
- `do/match-room/src/live/broadcaster.test.ts`: replace with live RPC integration unless implementation reveals a low-level failure that cannot be observed through RPC.

The MatchRoom Vitest configuration and integration TypeScript configuration must include `test/rpc/**/*.integration.test.ts` and `test/storage/**/*.integration.test.ts`; the old single-file `src/MatchRoom.integration.test.ts` include is removed. `check:full` must execute and typecheck both suites.

Each RPC method specification covers its successful path, expected semantic variants, lifecycle defects, and relevant eviction/concurrency behavior. Shared setup remains in `fixtures.ts`; method files must not recreate a second orchestration module in test code.

Application orchestration tests, not MatchRoom RPC tests, own recovery across D1 and MatchRoom:

- D1 active while `getControls`, `getProtocol`, `submitCommand`, or `stream` discovers a Finalizing Match;
- archive failure before persistence and a lost response after persistence;
- disposal failure before deletion and a lost response after deletion;
- D1 finish failure and retry after successful room disposal;
- D1 Match identity/lifecycle conflict or conflicting existing archive before archival completes.

## Acceptance

Accepted. No design items remain unsettled.

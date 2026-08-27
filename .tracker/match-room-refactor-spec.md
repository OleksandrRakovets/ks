# MatchRoom Refactor Specification

## Status

Draft architecture specification. Do not implement until this document covers the complete MatchRoom layout, the final public RPC interface, operator responsibilities, lifecycle ordering, and accepted test surfaces.

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

The final design should delete `MatchRoom.contract.test.ts` and the response-validation role of `match-room-client.ts`. Whether a small typed namespace selector remains is part of the operator and application-capability design.

## Agreed Module: MatchStorage

### Role

`MatchStorage` is the match-aware extension of Cloudflare's `DurableObjectStorage` capability. It owns the persisted representation and invariants of one active or finalizing Match.

The class is constructed with `DurableObjectStorage`. `MatchRoom` retains `blockConcurrencyWhile` and calls a migration operation on `MatchStorage`; the Drizzle client and migration bundle do not cross the storage seam.

### Interface Shape

The interface is operation-shaped, not record-shaped CRUD. Operators pass canonical typed domain values and receive canonical typed results. Persisted rows, Drizzle values, and serialized JSON never cross the seam.

Exact operation names and result types remain to be settled with the operator design. The required capabilities are:

- apply MatchRoom SQLite migrations;
- create the persisted Match from typed configuration, control secret, and creation time;
- read and validate the persisted Match lifecycle record;
- find a durable Command outcome and distinguish an identical retry from Command ID reuse with different content;
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

This is not gameplay restoration. Protocol bodies remain generic at this seam. `MatchStorage` must not execute Commands, restore `SparringMatch`, parse game-specific Protocol semantics, or produce projections. Resident restoration remains a competition/runtime responsibility. Application may apply archive authority checks and game-specific Protocol interpretation, but it does not reparse the trusted RPC result shape.

### Explicit Non-Responsibilities

`MatchStorage` does not own:

- RPC transport or result adaptation;
- Durable Object identity checks;
- `blockConcurrencyWhile`;
- resident `SparringMatch` state;
- gameplay execution or projection;
- SSE broadcast or stream bookkeeping;
- cross-store finalization orchestration;
- stream closure;
- `DurableObjectStorage.deleteAll()` in the first design;
- application or D1 access.

### Required Structural Changes

- Rename `ActiveMatchStore` to `MatchStorage`.
- Remove the public Drizzle `db` property.
- Move migration ownership behind the `MatchStorage` seam.
- Replace `configJson` and `requestJson` inputs with canonical typed values.
- Move durable Command request equality and stored outcome decoding into `MatchStorage`.
- Delete the shallow `storage/command-outcome.ts` implementation after its typed operation result has an appropriate owner.
- Remove `liveUpdatesAfter` from storage; it is a disposable live projection over authoritative sequence, not persistence.
- Replace `history(match)` with an operation that reads and validates its own authoritative cursor rather than accepting a previously exposed storage record.
- Keep Command and Protocol writes in one transaction. Do not split them into separate adapters.

## Provisional Test Architecture

The final test suite is designed after the public RPC interface is settled.

### MatchRoom RPC Integration

Cloudflare Vitest integration tests invoke the real final RPC methods through a real Durable Object stub. This is the executable specification for exported behavior:

- creation and idempotency;
- active reads and Protocol reads;
- accepted, rejected, duplicate, and conflicting Commands;
- transaction ordering and authoritative sequence;
- eviction and resident restoration;
- finalizing transfer and disposal ordering;
- live replay and publication behavior;
- lifecycle failures;
- relevant concurrent operations.

These tests should prefer observable RPC results and durable behavior over private module calls.

### Trusted MatchRoom Capability

MatchRoom RPC is a private typed capability between the independently deployed Play and MatchRoom Workers. Cloudflare transport does not by itself make the call a trust seam. TypeScript owns argument and result compatibility; MatchRoom and application do not maintain duplicate runtime schemas for the same RPC values.

Any private application module around the Durable Object namespace only selects the named object and adapts call ergonomics. It does not parse or validate RPC responses. It should have no mocked response-schema test suite.

Application use-case tests depend on the typed MatchRoom capability and test application orchestration. They do not restate MatchRoom behavior with mocked structural RPC results.

HTTP inputs, browser data, persisted rows and JSON, and restored machine state remain validation seams. Cross-store authority and lifecycle consistency checks also remain where they protect ordering or authoritative data; they are not RPC representation parsing.

### Current Test Disposition

- `do/match-room/src/MatchRoom.integration.test.ts`: evolve into the final RPC executable specification.
- `do/match-room/src/MatchRoom.contract.test.ts`: remove; TypeScript and final RPC integration own compatibility.
- `packages/application/src/match-room-client.test.ts`: remove with runtime RPC response parsing.
- private storage tests: decide after operator seams are complete; do not duplicate behavior already observable through RPC integration.

## Unsettled Design

- Final public MatchRoom RPC methods and result contracts.
- Operator grouping and dependency injection.
- Resident Match execution and cache ownership.
- Creation and read operator shape.
- Finalization transfer and disposal orchestration.
- Finalizing stream policy.
- Named Durable Object identity enforcement.
- Disposal after eviction and migration-created storage.
- Final file and folder layout.
- Exact test matrix and permitted private integration tests.

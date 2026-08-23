# Responsibility-Shaped Test Surfaces

## Status

Implemented on 2026-08-23. Candidate 1's speculative match execution and the combined candidate 2+3 snapshot-backed gameplay simplification were its implemented baseline. This decision replaced application D1 query fakes with a real match-lifecycle integration project, removed private MatchRoom test manipulation, and introduced explicit fast and full verification gates.

The completed implementation plan is `../test-surface-simplification-spec.md`.

## Context

Tests should invoke a module through the same interface used by its callers. Test setup may replace a real dependency at an established seam or seed a persisted representation before an operation, but it should not recreate the implementation being tested.

The remaining suites violate that rule in two places:

- application D1 tests construct partial objects that imitate Drizzle query chains and batch behavior,
- MatchRoom tests inspect resident identity, call private command methods, replace resident methods, install failure triggers, mutate storage during command execution, and use a Bun SQLite implementation of `DurableObjectStorage`.

These tests bind refactoring to private control flow and can claim behavior that the real D1 or Durable Object runtime has not demonstrated.

## Decision

### Application D1 integration project

`packages/application` owns a separate Cloudflare Vitest project for its private D1 adapters. It is a separate test runtime, not a new workspace package or production module.

The project:

- binds one Miniflare D1 database without a Worker entrypoint,
- applies the committed production D1 migration,
- constructs the real Drizzle adapter through `createApplicationDatabaseClient`,
- resets and migrates the database before each test,
- invokes private D1 adapter functions directly through their module interfaces,
- remains excluded from Bun's fast unit-test discovery.

The first suite covers the complete D1-owned match lifecycle:

```text
creating -> active -> finalizing -> finished
```

It exercises match creation, activation, catalog reads and ordering, terminal archival, protocol archive reads, archive idempotency/conflict, and completion.

Player and participant adapters are explicitly deferred. Their current tests are not expanded or converted in this candidate. A local `packages/application/test/d1/README.md` records those later opportunities.

The no-mock rule applies to candidate-owned match-lifecycle and MatchRoom surfaces. Existing player adapter query fakes are an explicit untouched exception until that deferred work is selected; this candidate adds no new fake there.

### Persistence fixtures

Tests may seed persisted rows before invoking the operation under test. This is input setup at a representation seam, not a database implementation substitute.

Seeds must be local and readable:

- keep one-off rows and malformed representations in the relevant test,
- use a nearby fixture module only when several cases share meaningful domain setup,
- do not create a generic seed builder or test database framework,
- use deterministic IDs and timestamps,
- use the real migration rather than a test-owned schema.

Temporary triggers, mid-operation SQL mutation, and injected database failures are not allowed. This candidate does not introduce dependency injection solely to force those paths.

### MatchRoom runtime surface

MatchRoom integration tests invoke public Durable Object RPC methods. Cloudflare test helpers may create or evict an object and may seed a persisted corruption fixture before the tested operation.

Tests must not:

- read or compare the private resident cache,
- call `submitCommandLocked` or another private method,
- replace `SparringMatch.execute`, `envelopeContents`, or another implementation method,
- install SQL triggers,
- mutate persisted state during a command,
- inspect receipt or fact tables after an operation when the same result is observable through RPC,
- combine independent malformed-command and corruption cases only to specify private ordering.

Retain externally observable coverage for creation, accepted and rejected commands, retry/conflict, publication, eviction and replay, terminal finalization, and reads of pre-seeded persisted corruption.

Terminal publication includes the MatchRoom policy that withholds `match.ended` until finalized disposal, then broadcasts it and closes the SSE stream.

The speculative-resident recovery branches remain production safeguards. They are not given a new injection seam merely to preserve tests that manufactured private failures.

### Storage adapter tests

Delete the Bun implementation of `DurableObjectStorage`, its fake SQL cursor, and injected-failure options. MatchRoom's real Workerd project owns observable storage integration. Pure row and receipt codecs retain focused unit tests because parsing persisted representations is their module interface.

### Gameplay and competition

This candidate does not restructure gameplay tests. The implemented `snapshot-backed-gameplay-sessions.md` decision already established machine, control, protocol, and gameplay-session test responsibility.

Competition already tests command execution and semantic restoration through `SparringMatch`. Candidate 4 only changes a corruption fixture when necessary to ensure it remains schema-valid and reachable from persisted facts.

### Verification gates

The repository has two explicit gates:

- `check` aliases `check:fast`, which runs formatting, lint, boundary guards, workspace typechecking, and Bun unit tests.
- `check:full` runs the fast gate, integration-project typechecking, all integration tests, and all builds.

Root `test:integration` and `typecheck:integration` commands use Turbo to run the scripts supplied by application and MatchRoom. Integration tests remain outside the fast gate even when Turbo has a cached result; fast describes predictable scope rather than likely wall-clock time.

Drizzle migration checks remain conditional when schemas or generated migrations change. They are not part of every full gate.

## Consequences

### Benefits

- D1 behavior is demonstrated by D1 rather than a query-chain imitation.
- Runtime tests assert RPC-visible behavior rather than cache shape.
- Test setup remains local enough to audit as persisted input.
- Gameplay's implemented responsibility-shaped suites remain outside this runtime/persistence cleanup.
- Fast and full verification costs are explicit.

### Costs

- Match lifecycle persistence tests use the slower Workerd/Vitest runtime.
- Some defensive recovery branches remain without forced-failure tests.
- Player D1 tests remain known follow-up work.
- The application workspace gains an integration-test configuration and development dependencies.

## Deletion Test

The implementation passes only if the named fake runtime/database artifacts and unreachable cases are deleted without a replacement fake. No new production export, dependency-injection seam, generic fixture framework, or separate integration workspace is allowed.

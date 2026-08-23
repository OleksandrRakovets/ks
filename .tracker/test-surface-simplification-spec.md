# Responsibility-Shaped Test Surface Simplification

## Status

Ready implementation plan for `decisions/responsibility-shaped-test-surfaces.md`. Candidate 1's speculative match execution and the combined candidate 2+3 snapshot-backed gameplay simplification have landed. Their production and test surfaces are the baseline for this independent runtime/persistence cleanup.

## Target test topology

```text
Bun fast tests
  -> pure domain and representation modules
  -> application orchestration through its dependency interface
  -> no Workerd or migrated databases

Application D1 integration project
  -> real migrated Miniflare D1
  -> private application D1 adapter interfaces
  -> match catalog and archive lifecycle

MatchRoom integration project
  -> public Durable Object RPC
  -> real Durable Object SQLite and eviction
  -> local pre-operation corruption seeds only
```

Gameplay's implemented machine/control/protocol/session topology is documented separately and remains unchanged by this plan.

## Application D1 project

### Location

Keep the project inside the owning workspace:

```text
packages/application/
  vitest.config.ts
  tsconfig.integration.json
  test/d1/
    README.md
    env.d.ts
    match-lifecycle.integration.test.ts
    match-lifecycle-fixtures.ts       # only if shared setup earns a file
```

Do not create a new workspace package. The adapters are private to application and must not be exported to support an external test project.

### Runtime configuration

Use `@cloudflare/vitest-pool-workers` and Vitest as catalog-managed development dependencies of `@ks/application`.

The Vitest project:

- has a D1 binding named `DB`,
- uses compatibility date `2026-08-11`,
- has no Worker entrypoint and does not load Play's Wrangler configuration,
- includes only `test/**/*.integration.test.ts`,
- exposes the production D1 migrations to the test runtime.

Production migrations are nested under timestamped directories. Configuration must enumerate those directories in lexical order, load each `migration.sql` with Cloudflare's migration reader, assign each migration a unique timestamped name, flatten the result, and fail when no migrations are found. Do not copy migration SQL into the application workspace.

`env.d.ts` declares the `DB` binding and migration fixture binding for the integration runtime. `tsconfig.integration.json` includes that declaration, integration tests, and `vitest.config.ts`, with Cloudflare/Vitest Worker, Workers, and Node types. Add catalog-managed `@types/node` because migration enumeration runs in Vitest's Node configuration process.

Before each test, reset isolated storage and apply the production migrations. Tests must not rely on execution order or generated unique IDs for isolation.

### Match lifecycle coverage

Own one readable vertical flow:

1. begin a creating catalog row,
2. repeat identical creation idempotently and reject conflicting creation,
3. activate it,
4. read it and establish catalog filtering/order with local rows,
5. archive a replay-valid terminal journal and projection,
6. observe the finalizing catalog row and persisted protocol archive,
7. repeat the identical archive idempotently and reject conflicting archive data,
8. finish the match and observe the finished row.

Add focused persisted-representation cases only where they add a different trust-seam assertion, such as malformed archive JSON or an unsupported archive version. Seed those rows locally before invoking the reader.

Retain representative application-owned rejection cases for:

- an invalid terminal/envelope shape,
- semantic replay mismatch,
- supplied terminal projection mismatch.

Each rejection observes that the real catalog and archive remain unchanged. Do not preserve the full old permutation matrix when one case owns the same validation responsibility.

Retain a locally seeded archive with a syntactically valid historical game key. Delete the old requested-row-ID mismatch case: an equality query on the archive primary key cannot return a row carrying another ID in real D1.

Generate a terminal archive fixture through supported competition operations. The fixture may envelope semantic facts with deterministic IDs, sequence, causation, and acceptance times. It must not recreate match completion policy or manually construct an impossible terminal projection.

Do not test player creation, participant hydration, localization, or player-row corruption in this slice. Record those files as opportunities in `test/d1/README.md`:

- `src/d1/guest-players.ts`,
- `src/d1/players.ts`,
- the remaining player fake-based tests.

### Existing application tests

Move the real persistence assertions from these Bun suites into the D1 integration project:

- `src/d1/completed-matches.test.ts`,
- `src/d1/protocol-archives.test.ts`.

Delete their hand-built `ApplicationDatabase`, Drizzle query-chain, pending-write, and batch implementations. Keep a fast test only when it exercises a pure representation operation through a real module interface without a database substitute.

Leave player tests unchanged in this candidate. Application use-case tests retain their orchestration dependencies; they do not imitate Drizzle or D1 and are outside this slice.

## MatchRoom integration cleanup

### Public invocation rule

Every behavior assertion begins with a public RPC call and is observed through an RPC result, returned facts/projection, stream output, eviction/reload behavior, or finalization result.

Cloudflare runtime helpers may:

- obtain and evict the Durable Object stub,
- seed a complete local persisted fixture before the operation under test.

Storage seed setup must remain adjacent to the corruption case. It may use direct SQL because the stored representation is the test input, but it must not become a reusable mutation interface.

### Delete private runtime tests

Delete tests and helpers whose primary subject is:

- exact resident object identity,
- private resident presence,
- direct `submitCommandLocked` invocation,
- a replaced `execute` method,
- a replaced `envelopeContents` method,
- cursor mutation from inside execution,
- trigger-injected persistence failure,
- duplicated execute-defect behavior,
- corruption combined with an unsupported command to specify private precedence.

Delete post-operation `receiptExists` and SQL count assertions when command-ID reuse, `listFacts`, `snapshot`, or another RPC demonstrates the same contract.

Retain one representative malformed match command and one malformed game command only when they exercise distinct production parsing ownership. Do not repeat gameplay's parser matrix at MatchRoom.

### Retain reachable runtime behavior

Retain focused RPC integration for:

- idempotent creation,
- accepted facts and publication after commit,
- rejected receipts without cursor movement,
- command-ID retry and conflict,
- malformed command rejection without a durable receipt, proven by later valid reuse of the command ID,
- Durable Object eviction followed by semantic replay,
- terminal finalization and disposal,
- finalizing lock behavior,
- withheld terminal-fact publication followed by broadcast and SSE closure on disposal,
- persisted journal corruption seeded before the read or retry,
- one locally seeded persisted-receipt corruption retry case.

The receipt-before-restoration ordering case may seed a matching receipt beside a corrupt journal, evict the object, and invoke the public command RPC. It must not inspect the resident.

## MatchRoom storage unit cleanup

Delete:

- `src/storage/test-helpers.ts`,
- `src/storage/active-match-store.test.ts` in full,
- the fake `DurableObjectStorage` and `SqlStorageCursor`,
- injected write-failure controls,
- direct `ActiveMatchStore` tests.

Internal store safeguards that cannot occur through serialized MatchRoom RPC remain defensive production checks without a forced test seam.

Retain focused tests for:

- stored fact row encode/decode and malformed rows,
- command receipt encode/decode and malformed persisted values,
- broadcaster publication/close ordering where the broadcaster itself is the module under test.

Delete the MatchRoom contract test that constructs a competition projection without invoking MatchRoom or an RPC representation operation. Retain contract tests that exercise request schemas and canonical command representation.

Do not replace the deleted storage fake with another adapter or generic harness.

## Competition fixture correction

Every semantic-history mismatch fixture must first satisfy the persisted fact schema. Replace an empty `protocolEntries` corruption with a non-empty, schema-valid but semantically different protocol entry. Competition then continues to prove full-batch replay verification through `restoreSparringMatch` without bypassing the storage representation seam.

## Verification commands

### Root scripts

Define:

```text
check              -> check:fast
check:fast         -> format:check + lint + check:boundaries + typecheck + bun test
typecheck:integration -> turbo run typecheck:integration
test:integration   -> turbo run test:integration
check:full         -> check:fast + typecheck:integration + test:integration + build
```

Add `test:integration` and `typecheck:integration` task definitions to `turbo.json`. Both application and MatchRoom supply those scripts. Keep `*.integration.test.ts` excluded in `bunfig.toml`.

Remove deployable build dependencies on the uncached root `//#check` task. `check:full` invokes `check:fast` exactly once before integration and build; `bun run build` remains a build command rather than an implicit verification gate.

Turbo caching does not move integration tests into the fast gate. Integration remains explicit even when a repeated full run is cached.

Update `AGENTS.md`:

- `bun run check` and `bun run check:fast` are the fast local gate,
- `bun run check:full` is required before merge or deployment handoff,
- `bun run test:integration` runs both Workerd integration projects,
- migration checks remain conditional when migration assets change.

Update active specifications to use `check:full` at final handoff rather than spelling out one integration project. Historical completed slice records need not be rewritten except where they incorrectly claim the current gate policy.

Mark the storage-test ownership paragraph in `speculative-match-execution-spec.md` superseded by the later responsibility-shaped test decision. Candidate 1's production cursor and recovery safeguards remain unchanged.

## Implementation slices

### Slice 1: Real D1 match lifecycle

Add the application Vitest project, integration TypeScript project, local D1 documentation, migration/reset setup, and complete match lifecycle suite. Replace completed-match and protocol-archive database fakes with real D1 cases. Add root integration commands and the fast/full gate vocabulary.

Exit gate:

- application integration tests use the real migrated D1 binding,
- no application match-lifecycle test imitates Drizzle query methods or D1 batch behavior,
- no production D1 adapter is exported for tests,
- player adapter scope is unchanged and recorded as follow-up,
- `bun run check:fast` and application integration typecheck/tests pass.

### Slice 2: Observable MatchRoom runtime

Delete private resident/method tests, SQLite trigger and mid-command mutation cases, duplicate/composite negatives, fake Durable Object storage, and obsolete helpers. Rewrite retained cases around public RPC and local pre-operation persistence seeds. Correct the competition protocol mismatch fixture.

Exit gate:

- MatchRoom behavior assertions invoke public RPC,
- no test reads resident identity or calls a private MatchRoom method,
- no test replaces production methods or installs failure triggers,
- no test mutates storage during command execution,
- no fake Durable Object storage or SQL cursor remains,
- no direct ActiveMatchStore test suite remains,
- retained corruption seeds are local and precede the operation under test,
- `bun run check:full` passes.

### Final reconciliation

Update active architecture and test documentation. Run Knip to find dormant test exports and helpers exposed by the deletions.

## Hard deletion gate

Identifier-aware searches must find no test declaration of:

```text
readResident
warmResidentMatch
MockSqlCursor
createTestSqlStorage
createTestStorage
failOnAcceptedFactInsert
createArchiveDatabase
```

No test may reference the production-private `submitCommandLocked`. `databaseReturning` must disappear from completed-match and protocol-archive tests; the deferred player suite is exempt. `src/storage/test-helpers.ts` and `src/storage/active-match-store.test.ts` must be absent.

A new workspace package, replacement fake, production export, generic database test adapter, or test-only dependency-injection seam fails the candidate.

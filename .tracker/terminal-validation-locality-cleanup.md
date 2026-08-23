# Terminal Validation Locality Cleanup

## Status

Planned follow-up after `test-surface-simplification-spec.md`. Candidate 4 completion is a hard entry gate because this cleanup relocates cases into its real integration projects. Candidate 1 already concentrated terminal semantics in canonical competition execution and replay. This cleanup moves remaining representation validation to the adapters that own each trust seam and deletes policy reconstruction from application orchestration.

This plan does not merge MatchRoom and archive validation. They consume different persisted representations across a Worker boundary and must remain independently fail-closed.

## Target ownership

```text
Competition
  -> match lifecycle, targets, winners, completion, terminal semantics

MatchRoom storage adapter
  -> active-row and accepted-fact representation

MatchRoom
  -> local journal envelope/group coherence and canonical replay

Application MatchRoom client
  -> cross-Worker RPC representation

Completed archive writer
  -> independent envelope grouping, canonical replay, projection cross-check, D1 write

D1 archive reader
  -> persisted archive columns, JSON, version, and stored-state representation

Application use cases
  -> catalog routing, expected game key, hydration, and finalization orchestration
```

## Cleanup steps

### 1. Parse the active MatchRoom row at storage

Add a private active-row codec at the original representation seam in `do/match-room/src/storage/active-match-store.ts`.

Validate:

- match ID,
- positive `latestSeq`,
- `active | finalizing` status,
- creation timestamp,
- control-secret representation,
- `configJson` as a valid active `MatchConfig` with a currently registered game key,
- equality between row match ID and config match ID.

`ActiveMatchStore.match()` returns the parsed canonical row or throws contextual storage corruption. MatchRoom does not reparse these fields.

When MatchRoom reads the accepted journal, require the singleton `match.created` payload to equal the parsed active-row config. Historical syntactic game keys remain supported only in completed D1 archives, not active rooms.

### 2. Parse structured MatchRoom RPC results in the client

Give `packages/application/src/match-room-client.ts` private Valibot decoders for structured responses from:

- `create`,
- `snapshot`,
- `submitCommand`,
- `listFacts`,
- `finalization`,
- `disposeFinalized`.

Validate discriminants, failure status/error representation, identifiers, cursors, command receipts, facts, timestamps, state, control sections, and finalization fields. After parsing snapshot or finalization state, use its registered game key to parse any control projection through gameplay's keyed parser.

Require request/result coherence:

- create result match ID equals the requested match ID,
- snapshot state match ID equals the requested match ID,
- every listed fact belongs to the requested match,
- finalization facts and projection state belong to the requested match,
- snapshot and finalization state game keys correlate with their keyed control projections.

The snapshot decoder also owns the MatchRoom projection representation invariant: control projection presence must agree with active-frame versus between-frame state. This check moves from use-case orchestration; it does not calculate scoring, targets, winners, or terminal meaning.

The client validates representation only. The active-frame/between-frame control-presence correlation above is part of the MatchRoom projection representation. The client must not infer gameplay availability or calculate targets, winners, completion, or terminal meaning. `stream()` remains an opaque `Response` pass-through because stream-event parsing belongs to its consumer.

Every malformed structured RPC result becomes `{ ok: false, error: 'Invalid MatchRoom response', status: 502 }`. RPC transport exceptions still propagate. Internal finalization/disposal orchestration converts the declared client failure through its existing defect path. Do not widen use cases with raw RPC values.

### 3. Delete domain reconstruction from use cases

In `packages/application/src/use-cases.ts`, delete:

- `isTerminalArchivedSnapshot`,
- `expectsControlProjection`,
- direct parsing of room state, cursor, control sections, and control projection,
- errors and tests that exist only for those relocated checks.

Archived reads trust the D1 archive adapter's canonical `finished` representation. Active reads trust the MatchRoom client's parsed and cross-field-validated projection. Presence or absence of a control projection then determines presentation state without reconstructing the invariant again.

Retain:

- catalog status routing,
- expected route game-key checks against catalog and returned state,
- participant hydration,
- active/finalizing/finished convergence,
- conversion of archive codec failures into declared application failures.

### 4. Simplify MatchRoom after canonical row/fact parsing

Retain:

- non-empty local journal and tail/cursor coherence,
- sequence, match identity, singleton creation, causation, and batch-time grouping,
- canonical `restoreSparringMatch` replay,
- finalizing-row requirement,
- requirement that the journal tail is `match.ended`,
- terminal `acceptedAt` as `endedAt`.

Delete:

- reparsing `{ type, payload }` already decoded by `StoredMatchFactSchema`,
- the duplicate tail/cursor check inside semantic grouping,
- the independent “facts after terminal” policy check already enforced by canonical replay,
- the post-replay `state.status === finished` reconstruction after a required terminal tail successfully replays.

Use the journal tail as the terminal fact in finalization and disposal rather than searching the complete journal. Disposal parses the active row and complete stored facts and requires an actual `match.ended` tail before deletion. It need not replay again: the application invokes destructive disposal only after archive replay and persistence have succeeded, including retry convergence.

### 5. Simplify the completed archive writer without weakening independence

Retain in `packages/application/src/d1/completed-matches.ts`:

- non-empty terminal journal requirement,
- independent sequence, match identity, causation, and batch-time grouping,
- independent canonical replay,
- supplied MatchRoom projection versus replay projection comparison,
- terminal `acceptedAt` versus `endedAt`,
- D1 idempotency, conflict, and catalog-status handling.

Delete checks repeated inside the same module after validated grouping or canonical replay:

- fact-content representation reparsing already owned by the MatchRoom RPC client,
- independent “facts after terminal” policy in the grouper,
- duplicate first-fact, tail-sequence, and per-fact match-ID loops,
- post-replay target/status/match-ID reconstruction already proved by terminal replay and complete projection comparison.

Do not extract a shared journal grouper between MatchRoom and application. Independent validation across the Worker boundary is intentional.

### 6. Keep D1 archive reads representation-only

Retain in `packages/application/src/d1/protocol-archives.ts`:

- archive version handling,
- column and JSON parsing,
- protocol rows and `MatchState` parsing,
- `finished` as an archive storage invariant,
- archive-row/state match identity,
- syntactically valid historical game keys.

Delete the requested-ID equality assertion after a primary-key equality query; real D1 cannot return another archive row from that query. Require positive `sourceLatestSeq`, because every archive derives from a non-empty journal, and cover zero as a persisted-representation corruption case.

Do not relocate match-target, terminal-winner, or frame-count calculations into the D1 reader. Independent semantic replay before archive writing owns those rules. The reader detects malformed or internally inconsistent archive representation, not every hypothetical post-write semantic mutation.

### 7. Reassign tests to the owning seams

After candidate 4 establishes real integration projects:

- test malformed active rows by local pre-operation MatchRoom SQLite seeds followed by public RPC,
- test malformed structured RPC output through a minimal result-producing namespace adapter passed to the existing `createMatchRoomClient` dependency seam, without imitating MatchRoom control flow or repeating terminal semantics,
- test archive writer semantic rejection and projection mismatch through the real-D1 lifecycle project,
- test malformed archive JSON/version/state through the D1 reader,
- delete use-case tests for target reconstruction and raw RPC parsing,
- retain use-case tests for routing and finalization convergence.

The result-producing namespace is permitted because it occupies the existing external RPC dependency seam; it is not a patched runtime or a new production seam. Do not add a shared validator, generic result-decoder module, production test seam, or compatibility path.

## Ordering

Implement after candidate 4 so the real D1 and observable MatchRoom suites receive the relocated cases. The gameplay simplification is otherwise independent; adapt to its final keyed control parser without changing gameplay's implementation plan.

## Deletion gate

Identifier-aware searches must find no production declaration or use of:

```text
isTerminalArchivedSnapshot
expectsControlProjection
Failed to parse completed match state
Archive row match ID does not match request
Session is not terminal
```

`match-room-client.ts` must be the only application module parsing structured MatchRoom RPC output. Use cases contain no match-target arithmetic or terminal winner reconstruction. MatchRoom and the archive writer retain separate journal grouping and separate calls to canonical competition replay.

## Verification

Run:

```text
bun run check:full
```

Run the relevant Drizzle migration checks only if schema or generated migration assets change; this cleanup should require neither.

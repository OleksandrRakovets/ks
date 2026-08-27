# MatchRoom Refactor Implementation Guide

Use this guide to implement `.tracker/match-room-refactor-spec.md`. The specification is the source of truth for the target architecture and behavior; this guide owns execution order and review gates.

## Working Loop

Implement one slice at a time.

1. Read the accepted specification and inspect the current code on the branch.
2. Tell the user which slice is starting, which paths should change, and which behavior remains stable.
3. Make the smallest coherent change that meets the slice completion criterion.
4. Run the slice's focused package gates.
5. Present the changed files, behavior preserved or introduced, verification results, and any open concern.
6. Stop for user review. User approval is the criterion for committing and starting the next slice.

Keep each slice reviewable on its own. Preserve unrelated work and report unrelated gate failures as existing evidence. Keep the exported `MatchRoom` Durable Object class and its Cloudflare namespace stable throughout the refactor.

## Strangler Sequence

### 1. MatchStorage Shell

- Rename `ActiveMatchStore` to `MatchStorage`.
- Move migration and the Drizzle client behind its seam.
- Keep RPC methods and behavior unchanged.

**Complete when:** MatchRoom accesses persistence only through MatchStorage, constructor migration still blocks initial event delivery, current MatchRoom tests pass, and the user approves the diff.

### 2. MatchStorage Representations

- Give MatchStorage canonical typed configuration and Command inputs.
- Move JSON encoding, semantic Command retry equality, and stored outcome decoding into storage.
- Absorb `command-outcome.ts` into focused private storage helpers.
- Add real-SQLite MatchStorage integration coverage for these representations.

**Complete when:** persisted JSON and row outcome shapes stay behind MatchStorage, semantic retries are independent of object property order, focused storage and MatchRoom tests pass, and the user approves the diff.

### 3. MatchStorage Reads

- Move Accepted Command history reconstruction, Protocol decoding, and finalizing transfer construction behind MatchStorage.
- Organize private row, entity, or query helpers by cohesive responsibility.
- Keep Accepted Command and Protocol writes in one transaction.

**Complete when:** MatchRoom receives only canonical typed history, Protocol, and completion transfer values; focused gates and `bun run check` pass; and the user approves the completed MatchStorage shape.

### 4. Match Initialization

- Extract the stateless initialization operation.
- Establish identity with `ctx.id.name` in MatchRoom.
- Let the first active operation initialize resident state lazily.
- Keep the existing RPC method as the temporary delegate.

**Complete when:** initialization is idempotent, resident seeding has left MatchRoom, exported RPC behavior remains stable, focused tests pass, and the user approves the diff.

### 5. Active Reads

- Introduce `ActiveMatch` with concrete MatchStorage and Broadcaster dependencies.
- Move transparent resident restoration, Controls projection, and Protocol reads into it.
- Keep the existing read RPC methods as temporary delegates.

**Complete when:** callers request projections directly from ActiveMatch, ActiveMatch alone determines resident availability, eviction restores reads, focused tests pass, and the user approves the diff.

### 6. Active Commands

- Move Command deduplication, finalizing gating, speculative execution, persistence coordination, resident publication, and invalidation into ActiveMatch.
- Keep non-terminal broadcast ordered after persistence.
- Preserve the existing RPC result until the contract cutover.

**Complete when:** accepted, rejected, duplicate, conflicting, failed-persistence, terminal, and post-eviction paths prove the accepted ordering; focused tests pass; and the user approves the diff.

### 7. Live Stream

- Move replay and stream admission into ActiveMatch.
- Return the finalizing signal for new streams while preserving existing clients for terminal delivery.
- Keep Broadcaster as the transport capability.

**Complete when:** replay/live races, cancellation, finalizing admission, and terminal withholding are covered; focused tests pass; and the user approves the diff.

### 8. FinalizingMatch

- Extract archive preparation and terminal publication/client closure.
- Keep `deleteAll()` in MatchRoom's explicit disposal RPC.
- Implement same-instance retries with resident `disposedAt` and reconstructed retries by deleting migration-created empty storage again.

**Complete when:** archive preparation avoids gameplay replay, disposal ordering and both retry modes pass focused tests, `bun run check` passes, and the user approves the diff.

### 9. Shape Checkpoint

Present MatchRoom and its collaborators while preserving the exported contract. MatchRoom should now construct concrete capabilities, verify runtime identity, proxy lifecycle operations, and own direct Cloudflare effects.

**Complete when:** the user confirms the internal shape before any application or RPC contract cutover begins.

### 10. Trusted RPC Cutover

- Replace the old RPC method set atomically with the accepted method names and semantic results.
- Bind Match identity once in the selected stub and use `finalizesMatch` for the terminal Accepted Command effect.
- Collapse MatchRoomClient to the typed selected stub.
- Remove RPC request/response schemas, HTTP-shaped MatchRoom failures, result reparsing, and redundant contract/client tests.
- Treat completion transfers as canonical while retaining D1 identity/lifecycle and archive-conflict checks.

**Complete when:** the accepted RPC interface is the sole path, Play proves generated-stub assignability through structural typing, application recovery paths pass, `bun run check` and `bun run check:full` pass, and the user approves the cross-workspace diff.

### 11. Executable Specification

- Arrange Cloudflare Vitest files under the accepted `test/rpc/` and `test/storage/` layout.
- Give each RPC method file its successful path, semantic variants, lifecycle defects, and relevant eviction or concurrency cases.
- Update Vitest and integration TypeScript discovery patterns.
- Remove superseded tests after their behavior is represented in the final suites.

**Complete when:** every test item in the accepted specification has one owner, both deployables build, `bun run check:full` passes, the accepted contract is the sole implementation path, and the user approves the branch as mergeable.

## Gate Discipline

For slices confined to `do/match-room`, run the MatchRoom package test, integration, typecheck, and build scripts. Run `bun run check` at the completed MatchStorage and completed lifecycle checkpoints. Run `bun run check:full` after the trusted RPC cutover and for final acceptance.

A gate reports scope. Keep the slice focused when an unrelated workspace fails, record the failure accurately, and continue with user direction.

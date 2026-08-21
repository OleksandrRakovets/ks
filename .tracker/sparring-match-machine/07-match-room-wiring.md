# Slice 7: MatchRoom Production Wiring

## Prerequisite

Slice 6 is accepted. Competition session/replay and tagged storage contracts are stable.

## Goal

Make `SparringMatchSession` the sole MatchRoom command, replay, snapshot, control, and terminal projection authority.

## Naming

Use:

```text
Application.submitMatchCommand
MatchRoomClient.submitCommand
MatchRoom.submitCommand
SparringMatchSession.decide
SparringMatchSession.applyCommitted
```

Rename `commandMatch`, MatchRoom client `command`, MatchRoom RPC `facts`, and `FactsBodySchema`. Keep `listFacts` for journal retrieval.

## Resident Cache

```ts
type ResidentRoom = {
  readonly latestSeq: number
  readonly session: SparringMatchSession
}

private resident: ResidentRoom | null = null
```

Reuse only when resident sequence equals the active row. Otherwise read the complete ordered journal, validate non-empty contiguous sequence ending at `latestSeq`, restore the session, and replace cache. Existing row plus invalid journal is storage corruption.

Before replacement or cache clearing, call `resident.session.dispose()`. Room disposal also disposes the session. Disposal is idempotent.

## Creation

Inside serialized execution:

1. Parse request and build `MatchConfig`.
2. Resolve idempotent existing creation/conflict.
3. Draft `match.created`.
4. Add fact ID, match ID, and occurrence time without command causation.
5. Commit room and fact atomically.
6. Restore session from exact committed fact.
7. Cache committed sequence/session.

Creation commits no automatic `frame.started` fact.

## Command Submission

Inside `blockConcurrencyWhile`:

1. Validate body, deletion, room identity, and canonical request JSON.
2. Return matching receipt or command-ID conflict.
3. Lock new command IDs while finalizing.
4. Load sequence-matched resident session.
5. Parse through competition.
6. Return `invalid-command-body` with status 400 and no receipt for competition parse failure.
7. Decide through the session.
8. Persist rejected decision as rejected receipt and return.
9. For acceptance, add fresh fact IDs, room ID, one batch occurrence time, and `causedByCommandId`.
10. Commit facts and accepted receipt atomically.
11. Apply prepared transition against exact committed facts.
12. Update resident sequence.
13. Broadcast committed non-terminal facts in order.
14. Return accepted outcome and terminal flag.

No broad catch converts parsing, decision, replay, persistence, or application defects to rejection.

## Failure Ordering

Persistence failure discards the prepared transition and leaves resident state/sequence unchanged.

Post-commit `applyCommitted` failure preserves storage, clears resident cache, broadcasts nothing, and throws. A retry returns the committed receipt; later state operations cold-restore.

## Snapshot

Snapshot loads the resident session and returns `session.project(latestSeq)` with only mechanical RPC wrapping. MatchRoom no longer creates gameplay state, calculates breakers/winners/concession outcomes, derives summaries, or merges controls.

## Finalization

Terminal acceptance atomically commits the complete batch, accepted receipt, final sequence, and finalizing status. The terminal fact remains withheld from live clients until archive succeeds.

`finalization` cold-restores when needed, requires terminal session/journal, and returns:

```ts
type MatchRoomFinalizationData = {
  readonly sourceLatestSeq: number
  readonly endedAt: UnixEpochMilliseconds
  readonly facts: readonly StoredMatchFact[]
  readonly projection: SparringMatchRoomProjection
}
```

This slice adds the production projection to `MatchRoomFinalizationData` and forwards it through application orchestration. Existing archive persistence remains unchanged until Slice 8 verifies replay equality and uses the supplied projection. Disposal broadcasts terminal fact, closes live streams, deletes storage, disposes/clears resident state, and remains idempotent.

## Application Contract

```ts
export type SubmitMatchCommandResult =
  | { readonly ok: true; readonly outcome: CommandReceiptOutcome }
  | { readonly ok: false; readonly error: string; readonly status: number }

submitMatchCommand<K extends RegisteredGameKey>(
  matchId: MatchId,
  commandId: CommandId,
  command: ControlCommand,
  expectedGameKey: K,
): Promise<SubmitMatchCommandResult>
```

Only accepted terminal results trigger archive/dispose/finish. Rejection remains explicit. Existing `match-locked` recovery finalizes an already committed terminal match.

## Files

Update:

```text
do/match-room/src/MatchRoom.ts
do/match-room/src/rpc-contract.ts
do/match-room/src/storage/store.ts
do/match-room/src/MatchRoom.contract.test.ts
packages/application/src/contracts.ts
packages/application/src/match-room-client.ts
packages/application/src/use-cases.ts
packages/application/src/use-cases.test.ts
packages/application/src/factory.ts
apps/play/web/routes/match/shared.tsx
apps/play/web/routes/match/shared.test.ts
```

Reduce `active-game.ts` to mechanical RPC response adaptation in this slice. Slice 8 deletes it after consumers import the production projection directly.

Regenerate worker binding types through workspace typechecks.

## Tests

Contract tests parse accepted/rejected RPC results and consume production projections without constructing old state.

Real DO/SQLite integration covers:

- creation fact/session order,
- warm accepted command and causation,
- accepted and rejected receipt retries/conflicts,
- rejection without facts/sequence movement,
- defect without receipt,
- storage failure before actor mutation,
- post-commit apply failure and cold recovery,
- cache loss/reinstantiation during active game,
- atomic game/frame/terminal batches,
- finalizing retry and new-command lock,
- terminal projection/journal,
- disposal and corruption failures.

Add `vitest` and `@cloudflare/vitest-pool-workers` as catalog-managed MatchRoom dev dependencies. Add `do/match-room/vitest.config.ts`, `src/MatchRoom.integration.test.ts`, and this workspace script:

```json
"test:integration": "vitest run --config vitest.config.ts"
```

Run it explicitly with `bun run --cwd do/match-room test:integration`. Bun resolves and launches the package script; the `vitest` executable uses its Node shebang and Cloudflare worker pool rather than Bun's test runtime. Keep this command outside root `bun run check`.

Application tests verify accepted/rejected mapping, terminal archival, lock recovery, and production terminal projection.

## Verification

```text
bun test do/match-room/src
bun run --cwd do/match-room test:integration
bun test packages/application/src/use-cases.test.ts
bun run --cwd do/match-room typecheck
bun run --cwd do/match-room build
bun run --cwd apps/play typecheck
bun run check
```

## Exit Gate

- MatchRoom resident domain state is only `{ latestSeq, session }`.
- Competition parses and decides every command.
- No actor advances before commit.
- Rejections are explicit/idempotent; defects remain visible.
- Warm and cold responses match.
- Snapshot and finalization use session projection.
- MatchRoom contains no match/game policy.
- Terminal facts, receipts, sequence, and status commit atomically.

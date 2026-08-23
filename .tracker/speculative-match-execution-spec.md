# Speculative Match Execution Simplification

## Status

Implemented on 2026-08-23. This document is the completed implementation record for `decisions/speculative-resident-match-execution.md`.

The implementation replaces the old path directly. The project is unreleased, so there are no compatibility aliases, dual timestamp fields, parallel match implementations, or data backfills.

## Target interface

```ts
export type MatchFactContent =
  MatchCreatedContent | FrameStartedContent | GameCommandContent | FrameCompletedContent | MatchEndedContent

export type MatchCommandResult =
  | {
      readonly _tag: 'parse-failed'
      readonly reason: MatchCommandParseFailure
    }
  | {
      readonly _tag: 'rejected'
      readonly reason: SparringMatchRejection
    }
  | {
      readonly _tag: 'accepted'
      readonly facts: MatchFactContentBatch
    }

/** Semantic facts produced atomically by one accepted match command. */
export type MatchFactContentBatch = readonly [MatchFactContent, ...MatchFactContent[]]

/** Accepted semantic history, beginning with a singleton `match.created` batch. */
export type MatchFactContentHistory = readonly [MatchFactContentBatch, ...MatchFactContentBatch[]]

export interface SparringMatch {
  /**
   * Executes one untrusted control command against resident match state.
   *
   * Acceptance advances resident state before durable persistence. The caller must discard the resident if accepted
   * enveloping or persistence subsequently fails.
   *
   * @param command - The validated transport envelope whose game-specific payload is parsed by the match.
   * @returns A parse failure, expected rejection, or accepted semantic fact batch.
   * @throws An unrecoverable execution defect; resident state may have partially advanced and must be discarded.
   */
  execute(command: ControlCommand): MatchCommandResult

  /** Returns the current semantic state and controls without storage cursor metadata. */
  project(): SparringMatchRoomProjection

  /** Releases the retained gameplay session. Disposal is idempotent. */
  dispose(): void
}

/**
 * Drafts the semantic creation fact without constructing resident state.
 *
 * @param config - The parsed configuration for the new match.
 * @returns Singleton creation content for MatchRoom to accept as sequence 1.
 */
export function draftSparringMatchCreation(config: MatchConfig): Extract<MatchFactContent, { type: 'match.created' }>

/**
 * Restores disposable resident state from envelope-validated accepted semantic batches.
 *
 * @param batches - Complete accepted history grouped by command transaction.
 * @returns A resident match at the end of that history.
 * @throws An unrecoverable defect when history is impossible or incompatible with deployed rules.
 */
export function restoreSparringMatch(batches: MatchFactContentHistory): SparringMatch
```

`dispose()` remains only because the current gameplay implementation retains actors. A later gameplay simplification may remove it.

The projected room value is:

```ts
export type SparringMatchRoomProjectionFor<K extends RegisteredGameKey> = {
  readonly state: MatchStateFor<K>
  readonly controlProjection: ControlProjectionFor<K> | undefined
  readonly controlSections: ControlCommandSections
}
```

`latestSeq` is not part of this value. MatchRoom returns it as a sibling field.

## Fact types

```ts
export type MatchFact = MatchFactContent & {
  readonly factId: FactId
  readonly matchId: MatchId
  readonly causedByCommandId: CommandId | null
}

export type StoredMatchFact = MatchFact & {
  readonly seq: number
  readonly acceptedAt: UnixEpochMilliseconds
}
```

`match.created` requires null command causation. Every command-produced fact requires one command ID. `ActiveMatchStore.commitCreation` and `commitAccepted` allocate `acceptedAt`; every fact in one accepted command has the same value. The timestamp is a candidate until its transaction commits.

## Runtime call stack

For an active room whose persisted and resident cursor is 10:

```text
MatchRoom.submitCommand
  -> validate RPC body
  -> serialize through blockConcurrencyWhile
  -> return an existing matching receipt before execution
  -> require active row and resident at latestSeq 10
  -> resident.match.execute(command)
       -> parse
       -> advance resident match/game state once
       -> retain speculative next state
       -> return semantic fact content
  -> assign fact IDs, match ID, and command causation
  -> ActiveMatchStore.commitAccepted
       -> require persisted latestSeq equals expectedLatestSeq 10
       -> allocate seq 11..N and one acceptedAt
       -> transactionally insert facts
       -> transactionally update latestSeq to N
       -> transactionally insert accepted receipt
       -> transactionally mark finalizing when match.ended is present
  -> update resident.latestSeq to N
  -> broadcast committed non-terminal facts
  -> return receipt
```

The durable increment occurs when the SQLite transaction commits. Sequence and timestamp values calculated before commit are local candidates only. The active-row update must verify the expected cursor and affect exactly one row.

If accepted enveloping or persistence fails after speculative execution, MatchRoom clears the resident. SQLite remains at 10, and the next state operation restores facts 1 through 10.

Creation follows one path:

```text
draft match.created
  -> persist as seq 1 with one acceptedAt
  -> restore resident from accepted match.created content
  -> cache at latestSeq 1
```

There is no pre-commit `createSparringMatch(config)` path. `draftSparringMatchCreation` creates semantic content only; the sole production resident constructor restores from already accepted semantic batches whose first batch is singleton `match.created`.

## Semantic transition kernel

The implementation must have one private source of transition semantics.

Warm execution:

1. Parse the control command using the authoritative match game key.
2. Validate match-owned policy or delegate typed game commands to gameplay.
3. Invoke one aggregate command operation and advance resident match and gameplay state once.
4. For gameplay, call `decide` once, immediately call `applyCommitted`, and derive protocol and outcome content from the verified applied result.
5. Derive one ordered semantic fact-content batch from that operation.
6. Return acceptance after resident state has advanced.

Cold restoration:

1. Initialize from `match.created`.
2. Receive semantic batches whose storage envelopes and grouping have already been validated.
3. Reconstruct one canonical command from each non-creation batch.
4. Invoke the same aggregate command operation used by warm execution.
5. Compare the complete emitted batch with the stored batch, including protocol entries, frame outcome, completion, terminal presence, and order.
6. Fail loudly on impossible or incompatible accepted history.

Warm and cold paths may have different representation adapters, but neither adapter implements lifecycle advancement, target evaluation, completion policy, terminal policy, game-key dispatch, or projection state. Cold restoration has no semantic replay batch grouper or pending-completion state.

The existing gameplay implementation may internally evaluate its XState event once during `decide` and again during `applyCommitted`. This candidate requires one gameplay decision, one prepared-transition consumption, and one resident advancement per aggregate command; eliminating gameplay's internal double evaluation belongs to candidate 2.

Protocol arrays are compared in order using schema-validated structural equality. Raw JSON-string equality is not semantic object equality.

The XState lifecycle snapshot is the sole match-target authority. After applying `frame.completed`, the kernel emits `match.ended` only when the resulting lifecycle phase is terminal, using the winner from that resulting lifecycle. Competition has no second target-reached calculation for fact drafting.

## State representations

### XState snapshot

`SparringMatchSnapshot` is produced by XState and remains private to competition production code plus the tooling subpath. Competition stores the snapshot value directly and advances it with pure transitions. It does not retain a match actor.

During an active frame, `SparringMatch` still retains one mutable `GameplaySession`. Candidate 1 removes only the resident match actor.

### Product state

`MatchState` replaces `MatchSnapshot`:

```ts
export type MatchState = {
  readonly matchId: MatchId
  readonly gameKey: GameKey
  readonly targets: MatchTargets
  readonly status: 'active' | 'finished'
  readonly currentFrameIndex: number
  readonly framesWonBySeat: BySeatNumber
  readonly frames: readonly FrameState[]
}
```

The current `SparringMatchState` intermediate is deleted. Projection derives `MatchState` directly from the private lifecycle snapshot and active gameplay state.

`latestSeq` remains beside state:

```ts
type MatchRoomRead = {
  readonly state: MatchState
  readonly latestSeq: number
  readonly controlProjection: GameControlProjection | undefined
  readonly controlSections: ControlCommandSections
}
```

Completed D1 archives retain `sourceLatestSeq` as separate archive metadata. Application read DTOs expose the cursor consistently as `latestSeq`, mapping archived `sourceLatestSeq` at the application seam.

## Storage adaptation

MatchRoom validates a stored journal before competition sees it:

- sequence starts at 1, is contiguous, and ends at the active row's `latestSeq`,
- all facts belong to the active match,
- `match.created` is first, singleton, and has null causation,
- every later batch is one contiguous group with common non-null command causation and common `acceptedAt`,
- a command ID does not recur in disjoint groups,
- `match.ended`, when present, is the final stored fact.

After validation, MatchRoom mechanically preserves transaction groups from contiguous common command causation and creates fresh `{ type, payload }` values grouped as `MatchFactContentHistory`. This adapter does not infer completion, terminality, command outcomes, or any other semantic grouping. A structural TypeScript assignment or cast does not count as stripping storage envelopes.

Resident clearing detaches the cached value before disposing it. A disposal defect must not leave a stale resident reachable.

Application independently repeats envelope and terminal validation at the MatchRoom RPC-to-D1 archive seam, then restores competition from fresh semantic batches. Before writing D1 it requires the final fact at `sourceLatestSeq`, `endedAt === terminal.acceptedAt`, terminal replay state, and equality between replayed and supplied terminal projections. Independent archive verification is intentional; it does not reimplement match semantics.

## Test ownership

### Competition

Use two primary files:

- `sparring-match.test.ts` for accepted commands, expected rejections, parse failures, projections, terminal batches, and warm/cold equality,
- `sparring-match-invalid-history.test.ts` for impossible ordering, incompatible stored game commands, protocol mismatch, completion mismatch, and facts after terminal state.

Expected rejection is normal valid behavior, not invalid history.

Delete tests for:

- match prepared-token ownership,
- stale, foreign, sibling, or reused match transitions,
- match revision counters,
- post-commit match application,
- manually patched unreachable XState snapshots,
- envelope sequence, causation, IDs, or timestamps.

### MatchRoom

Retain or add integration tests for:

- matching receipt retry before execution,
- command-ID conflict,
- accepted execution followed by successful atomic persistence,
- accepted persistence failure clearing the speculative resident,
- execution defect clearing the resident and writing nothing,
- cold restoration after resident loss,
- transaction rollback,
- rejected receipt without state or sequence movement,
- no broadcast before successful persistence,
- expected resident cursor mismatch aborting the transaction,
- terminal batch, finalizing lock, archival, and disposal.

`match.ended` must be the final stored fact. Its `acceptedAt` is completed-match `endedAt`. Matching terminal-command retries return their receipt before the finalizing lock; new command IDs remain locked.

Storage adapter tests own row parsing, sequence continuity, common causation, common `acceptedAt`, batch grouping, expected-cursor checks, and journal-tail agreement.

### Application

Application tests retain terminal archive replay, runtime validation of finalization RPC data, and cross-store retry behavior. They do not recreate match target policy or competition's invalid-history matrix.

## Implementation slices

Every slice is independently reviewable and ends with a green full-repository check. Do not use temporary aliases to split a rename across slices. Slices 1 and 2 are user-approved vocabulary prerequisites; candidate 1's depth and deletion test are judged on Slice 3 rather than credited to those renames.

### Slice 1: One acceptance timestamp

Replace `occurredAt` and `receivedAt` with `acceptedAt` across core facts, MatchRoom SQLite, live facts, protocol rows, completed archival, Play rendering, fixtures, and documentation.

Regenerate the unreleased MatchRoom initial migration in place. `accepted_facts` has one `accepted_at` column and no compatibility columns.

Exit gate:

- no production `occurredAt` or `receivedAt`,
- creation has one `acceptedAt`, and every command batch has one shared `acceptedAt`,
- terminal `endedAt` derives from terminal `acceptedAt`,
- protocol display derives from `acceptedAt`,
- `bun run check` passes,
- MatchRoom integration tests and both builds pass.

### Slice 2: Match state and cursor vocabulary

Rename `MatchSnapshot` to `MatchState`, rename projection fields from `snapshot` to `state`, and remove `latestSeq` from product state. MatchRoom, application contracts, archive metadata, routes, and live hooks carry the cursor separately.

Rename D1 archive implementation vocabulary from `snapshot_json` / `snapshotJson` to `state_json` / `stateJson` and regenerate the unreleased D1 initial migration in place. No historical decoder is retained.

Exit gate:

- `SparringMatchSnapshot` is the only XState snapshot name,
- no production `MatchSnapshot`, `MatchSnapshotFor`, or `snapshot.latestSeq`,
- active reads and archived reads expose one sibling cursor,
- live reconnect behavior remains covered,
- `bun run check` passes,
- MatchRoom integration tests and both builds pass.

### Slice 3: Speculative match execution

Rename `MatchFactDraft` to `MatchFactContent`, replace the match-level `decide` / `applyCommitted` path with `execute`, move parsing behind that interface, remove the resident match actor, restore from semantic content, and update MatchRoom/application consumers in one vertical replacement.

This slice must not alter gameplay's public interface or prepared-transition implementation.

Exit gate:

- no match-level prepared transition, token store, owner, revision, or candidate snapshot evidence,
- no `SparringMatchState`, standalone production replay state, or match actor,
- no competition import of stored envelopes, IDs, sequence, causation, or timestamps,
- `SparringMatch.execute` is the only production caller of match/game-key-dependent command parsing,
- no production path constructs a resident match before `match.created` commits,
- matching receipt lookup precedes resident loading and execution,
- any `execute` defect, including one after partial advancement, clears the resident and writes nothing,
- accepted enveloping or persistence failure rolls back and clears the resident,
- each accepted aggregate command invokes gameplay decision once, consumes its prepared transition once, and advances resident state once,
- one private aggregate command implementation owns lifecycle advancement, target evaluation, completion, terminal batching, game-key dispatch, and projection state,
- cold restoration reconstructs a command per semantic batch, calls that implementation, and compares its complete emitted batch,
- no semantic replay batch grouper, pending-completion state, duplicate target calculation, duplicate game-key dispatch, or equivalent renamed replacement remains; MatchRoom retains only mechanical transaction grouping from validated causation,
- behavioral tests invoke the supported competition interface rather than private kernels or resident fields,
- duplicate and parity-only tests are deleted in this slice rather than deferred,
- new and materially changed supported interfaces carry JSDoc for authority, mutation, ordering, trust, and defect contracts required by `AGENTS.md`,
- record the pre-slice baseline and demonstrate material net deletion across all hand-written production and test files changed by Slice 3; a nominal one-line reduction or displacement into a new file fails,
- `bun run check` passes,
- MatchRoom integration tests and both builds pass.

### Final architecture reconciliation

Update active architecture documentation after Slice 3 lands. Historical slice specifications remain only when clearly marked superseded.

Exit gate:

- every invalid-history, corruption, or injected-failure test names the production seam that can produce the condition; expected command rejections remain in the valid-behavior suite,
- each invariant has one primary owner test; cross-module tests verify adaptation and ordering rather than repeat the semantic matrix,
- no old commit-before-apply contract remains in active documentation,
- `bun run check` passes,
- MatchRoom integration tests and both builds pass,
- final diff demonstrates net deletion in competition production and tests.

## Final deletion gate

Identifier-aware production searches must find none of the following standalone match-level symbols or calls:

```text
MatchFactDraft
standalone MatchSnapshot
standalone MatchSnapshotFor
SparringMatchState
PreparedSparringMatchTransition
InvalidSparringPreparedTransitionError
createSparringMatchActor
createSparringMatchActorFromSnapshot
parseSparringMatchCommand
match-level applyCommitted
match-level decide
occurredAt
receivedAt
snapshot.latestSeq
```

`SparringMatchSnapshot` is retained. Gameplay's `PreparedGameTransition`, `GameplaySession.decide`, and `GameplaySession.applyCommitted` are explicitly exempt and must not change until the gameplay simplification.

## Verification

Run after every slice:

```text
bun run check
bun run --cwd do/match-room typecheck:integration
bun run --cwd do/match-room test:integration
bun run build
```

Migration-changing slices also run:

```text
bunx drizzle-kit check --config do/match-room/drizzle.config.ts
bunx drizzle-kit check --config d1/drizzle.config.ts
```

Only run the relevant Drizzle check when that schema changes. Review generated SQL and snapshots rather than treating successful generation as sufficient.

Before deploying an intentionally history-incompatible rule change, the user will verify that no active match must survive it and delete incompatible development matches. Do not add version dispatch, fallback replay, migration, or compatibility decoding.

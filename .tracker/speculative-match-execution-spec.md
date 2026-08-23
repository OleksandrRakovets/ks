# Speculative Match Execution Simplification

## Status

Implementation plan for `decisions/speculative-resident-match-execution.md`. Production code has not yet been changed to this design.

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
      readonly facts: readonly [MatchFactContent, ...MatchFactContent[]]
    }

export interface SparringMatch {
  execute(command: ControlCommand): MatchCommandResult
  project(): SparringMatchRoomProjection
  dispose(): void
}

export function draftSparringMatchCreation(config: MatchConfig): Extract<MatchFactContent, { type: 'match.created' }>

export function restoreSparringMatch(facts: readonly [MatchFactContent, ...MatchFactContent[]]): SparringMatch
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

`match.created` requires null command causation. Every command-produced fact requires one command ID. MatchRoom gives every fact in one accepted command the same `acceptedAt`.

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
       -> transition match/game state once
       -> retain speculative next state
       -> return semantic fact content
  -> assign fact IDs, match ID, and command causation
  -> ActiveMatchStore.commitAccepted
       -> read persisted latestSeq 10
       -> allocate seq 11..N and one acceptedAt
       -> transactionally insert facts
       -> transactionally update latestSeq to N
       -> transactionally insert accepted receipt
       -> transactionally mark finalizing when match.ended is present
  -> update resident.latestSeq to N
  -> broadcast committed non-terminal facts
  -> return receipt
```

The durable increment occurs when the SQLite transaction commits. Sequence values calculated before commit are local candidates only.

If accepted enveloping or persistence fails after speculative execution, MatchRoom clears the resident. SQLite remains at 10, and the next state operation restores facts 1 through 10.

Creation follows one path:

```text
draft match.created
  -> persist as seq 1
  -> restore resident from accepted match.created content
  -> cache at latestSeq 1
```

There is no pre-commit `createSparringMatch(config)` path.

## Semantic transition kernel

The implementation must have one private source of transition semantics.

Warm execution:

1. Parse the control command using the authoritative match game key.
2. Validate match-owned policy or delegate typed game commands to gameplay.
3. Calculate and apply the match/game transition once.
4. Derive ordered semantic fact content from the actual transition.
5. Return acceptance after resident state has advanced.

Cold restoration:

1. Initialize from `match.created`.
2. Translate each stored semantic fact into the same lifecycle or gameplay transition operation used by warm execution.
3. Regenerate and verify protocol entries, frame outcomes, frame completion, and terminal ordering.
4. Fail loudly on impossible or incompatible accepted history.

Warm and cold paths may have different adapters from command or fact representations, but must not have separate rule implementations.

## State representations

### XState snapshot

`SparringMatchSnapshot` is produced by XState and remains private to competition production code plus the tooling subpath. Competition stores the snapshot value directly and advances it with pure transitions. It does not retain a match actor.

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

Completed D1 archives retain `sourceLatestSeq` as separate archive metadata.

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
- terminal batch, finalizing lock, archival, and disposal.

Storage adapter tests own row parsing, sequence continuity, common causation, common `acceptedAt`, and journal-tail agreement.

### Application

Application tests retain terminal archive replay and cross-store retry behavior. They do not recreate match target policy or competition's invalid-history matrix.

## Implementation slices

Every slice is independently reviewable and ends with a green full-repository check. Do not use temporary aliases to split a rename across slices.

### Slice 1: One acceptance timestamp

Replace `occurredAt` and `receivedAt` with `acceptedAt` across core facts, MatchRoom SQLite, live facts, protocol rows, completed archival, Play rendering, fixtures, and documentation.

Regenerate the unreleased MatchRoom initial migration in place. `accepted_facts` has one `accepted_at` column and no compatibility columns.

Exit gate:

- no production `occurredAt` or `receivedAt`,
- one timestamp per command batch,
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
- receipt lookup precedes execution,
- all failures after accepted speculative execution clear the resident,
- warm and cold behavior use one transition kernel,
- competition production and test LOC both decrease from the pre-slice baseline,
- `bun run check` passes,
- MatchRoom integration tests and both builds pass.

### Slice 4: Test and documentation consolidation

Complete the valid-behavior / invalid-history test split, remove duplicated internal tests that survived mechanical replacement, and update active architecture documentation. Historical slice specifications remain only when clearly marked superseded.

Exit gate:

- every negative test names the production seam that can produce the condition,
- no old commit-before-apply contract remains in active documentation,
- `bun run check` passes,
- MatchRoom integration tests and both builds pass,
- final diff demonstrates net deletion in competition production and tests.

## Final deletion gate

Production searches must find none of:

```text
MatchFactDraft
MatchSnapshot
MatchSnapshotFor
SparringMatchState
PreparedSparringMatchTransition
InvalidSparringPreparedTransitionError
createSparringMatchActor
createSparringMatchActorFromSnapshot
parseSparringMatchCommand
session.applyCommitted
session.decide
occurredAt
receivedAt
snapshot.latestSeq
```

Gameplay's `PreparedGameTransition`, `GameplaySession.decide`, and `GameplaySession.applyCommitted` are explicitly exempt until the gameplay simplification.

## Verification

Run after every slice:

```text
bun run check
bun run --cwd do/match-room test:integration
bun run build
```

Migration-changing slices also run:

```text
bunx drizzle-kit check --config do/match-room/drizzle.config.ts
bunx drizzle-kit check --config d1/drizzle.config.ts
```

Only run the relevant Drizzle check when that schema changes. Review generated SQL and snapshots rather than treating successful generation as sufficient.

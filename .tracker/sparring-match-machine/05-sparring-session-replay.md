# Slice 5: Sparring Aggregate Session And Replay

## Prerequisite

Slice 4 and all gameplay-session slices are accepted.

## Goal

Create the root `@ks/competition` production API for sparring creation, command decisions, prepared transitions, fact replay, active gameplay-session ownership, and room projection. MatchRoom integration occurs in Slice 7.

## Fact Contracts

`@ks/core` owns these fact schemas/types because MatchRoom, competition, application, and live transport share them. Competition imports them and does not redefine or re-export a second copy.

Replace client-authored terminology with:

```ts
export type MatchFactDraft =
  | { readonly type: 'match.created'; readonly payload: MatchConfig }
  | { readonly type: 'frame.started'; readonly payload: FrameStartedPayload }
  | { readonly type: 'game.command'; readonly payload: GameCommandPayload }
  | { readonly type: 'frame.completed'; readonly payload: FrameCompletedPayload }
  | { readonly type: 'match.ended'; readonly payload: MatchEndedPayload }

export type MatchFact = MatchFactDraft & {
  readonly factId: FactId
  readonly matchId: MatchId
  readonly occurredAt: UnixEpochMilliseconds
  readonly causedByCommandId: CommandId | null
}

export type StoredMatchFact = MatchFact & {
  readonly seq: number
  readonly receivedAt: UnixEpochMilliseconds
}

export type AcceptedFactRef = {
  readonly seq: number
  readonly factId: FactId
}
```

Core schemas enforce matching creation IDs, syntactic `GameKeySchema`, non-empty game protocol entries, positive stored sequence, null causation on `match.created`, and command causation on all other variants. Competition parses creation and replay game keys with `RegisteredGameKeySchema`; core never imports gameplay.

`causedByCommandId` groups every fact produced by one accepted command. Replay does not use it for domain transitions.

## Command Contract

```ts
export type SparringMatchCommand =
  | { readonly type: 'frame.start' }
  | { readonly type: 'frame.commence'; readonly seat: Seat }
  | { readonly type: 'frame.concede'; readonly seat: Seat }
  | {
      readonly type: 'game.command'
      readonly commandType: string
      readonly command: ControlCommandPayload
    }
```

`parseSparringMatchCommand` maps the existing `ControlCommand` envelope to this union and returns a tagged parse failure for unsupported match commands.

```ts
export type ParseSparringMatchCommandResult =
  | { readonly _tag: 'parsed'; readonly command: SparringMatchCommand }
  | {
      readonly _tag: 'parse-failed'
      readonly reason: {
        readonly code: 'unsupported-match-command'
        readonly commandType: string
      }
    }
```

This parse failure produces no normal command receipt and maps to `invalid-command-body` in Slice 7. Malformed nested game payload remains a temporary gameplay rejection until Slice 9 moves all game parsing ahead of decision.

## Decision Contract

```ts
export type SparringMatchRejection =
  | { readonly code: 'frame-already-active' }
  | { readonly code: 'no-active-frame' }
  | { readonly code: 'wrong-breaker'; readonly expectedSeat: Seat }
  | { readonly code: 'match-already-over' }
  | {
      readonly code: 'game-command-rejected'
      readonly reason: GameCommandRejection
    }

export const SparringMatchRejectionSchema = v.variant('code', [
  v.object({ code: v.literal('frame-already-active') }),
  v.object({ code: v.literal('no-active-frame') }),
  v.object({
    code: v.literal('wrong-breaker'),
    expectedSeat: SeatSchema,
  }),
  v.object({ code: v.literal('match-already-over') }),
  v.object({
    code: v.literal('game-command-rejected'),
    reason: GameCommandRejectionSchema,
  }),
])

declare const PreparedSparringMatchTransitionBrand: unique symbol

export type PreparedSparringMatchTransition = {
  readonly [PreparedSparringMatchTransitionBrand]: true
}

export type SparringMatchDecision =
  | {
      readonly _tag: 'accepted'
      readonly facts: readonly [MatchFactDraft, ...MatchFactDraft[]]
      readonly transition: PreparedSparringMatchTransition
    }
  | {
      readonly _tag: 'rejected'
      readonly reason: SparringMatchRejection
    }
```

## Session Contract

```ts
export type ActiveGameState<K extends RegisteredGameKey> = {
  readonly gameKey: K
  readonly state: GameStateFor<K>
}

export type AnyActiveGameState = {
  [K in RegisteredGameKey]: ActiveGameState<K>
}[RegisteredGameKey]

type SparringMatchStateBase = {
  readonly config: MatchConfig
  readonly frames: readonly FrameState[]
  readonly framesWonBySeat: BySeatNumber
  readonly currentFrameIndex: number
}

export type SparringMatchState =
  | (SparringMatchStateBase & {
      readonly phase: 'between-frames'
      readonly activeGame: null
      readonly winnerSeat: null
    })
  | (SparringMatchStateBase & {
      readonly phase: 'frame-in-progress'
      readonly activeGame: AnyActiveGameState
      readonly winnerSeat: null
    })
  | (SparringMatchStateBase & {
      readonly phase: 'match-over'
      readonly activeGame: null
      readonly winnerSeat: Seat
    })

export type SparringMatchRoomProjectionFor<K extends RegisteredGameKey> = {
  readonly snapshot: MatchSnapshotFor<K>
  readonly controlProjection: ControlProjectionFor<K> | undefined
  readonly controlSections: ControlCommandSections
}

export type SparringMatchRoomProjection = {
  [K in RegisteredGameKey]: SparringMatchRoomProjectionFor<K>
}[RegisteredGameKey]
```

`session.project()` returns this domain projection without an RPC `{ ok: true }` wrapper.

```ts
export interface SparringMatchSession {
  readonly state: SparringMatchState

  decide(command: SparringMatchCommand): SparringMatchDecision

  applyCommitted(transition: PreparedSparringMatchTransition, facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): void

  project(latestSeq: number): SparringMatchRoomProjection
  dispose(): void
}

export function draftSparringMatchCreation(config: MatchConfig): Extract<MatchFactDraft, { type: 'match.created' }>

export function restoreSparringMatchSession(facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): SparringMatchSession

export function replaySparringMatch(facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): SparringMatchState
```

The concrete session retains one sparring actor, zero or one game-key-selected `GameplaySession`, one revision, and opaque prepared-transition contents. `dispose()` idempotently disposes the gameplay session, stops the match actor, invalidates transitions, and makes later operations throw.

## Decision Behavior

- `frame.start` prepares the next index, required breaker, gameplay-session creation, and one `frame.started` draft.
- `frame.commence` validates the breaker, prepares the game command, and returns one `game.command` draft.
- `frame.concede` uses current gameplay summary score and returns `frame.completed`, plus `match.ended` when target is reached.
- `game.command` delegates to the resident gameplay session. Ordinary results emit `game.command`; frame outcomes append `frame.completed`; a match-winning outcome also appends `match.ended`.

Game `winner-determined` and `awaiting-award` retain the gameplay session and emit no frame completion. `frame.award` closes the game. There is no explicit `match.end` command.

Decision does not mutate either actor. The prepared transition is owner-, revision-, batch-, and optional gameplay-transition-bound. `applyCommitted` compares ordered `{ type, payload }` against prepared drafts, then verifies common match ID, common command causation, contiguous sequences, and one occurrence time for the batch. Generated IDs and receipt times are not compared to drafts. It applies once, disposes gameplay after frame completion, increments revision, and invalidates sibling tokens.

## Replay

Replay requires contiguous sequence numbers starting at 1 and a first `match.created` fact. It:

- constructs the sparring actor from creation config,
- validates match identity and lifecycle ordering,
- creates gameplay session at `frame.started`,
- reparses/reapplies every accepted game command,
- compares regenerated protocol entries exactly with stored entries and throws journal incompatibility/corruption on mismatch,
- disposes gameplay at `frame.completed`,
- requires immediate matching `match.ended` after a target-reaching completion,
- rejects facts after terminal completion.

Replay throws on malformed or impossible accepted history.

Delete `FrameReopenedFactSchema` and the `frame.reopened` variant in this slice. Undo will introduce its own command-batch fact design later.

## Projection

`SparringMatchRoomProjection` contains keyed match snapshot, optional keyed game control, and merged control sections. Initial/between-frame state exposes frame start; active not-started game exposes commence for the breaker; active game exposes concession and game controls; terminal state exposes no controls.

## Files

Add:

```text
packages/competition/src/sparring-match.ts
packages/competition/src/sparring-match.test.ts
packages/competition/src/sparring-match-replay.test.ts
```

Update `packages/core/src/facts.ts` and core exports for fact ownership; update competition creation/control/index exports and `@ks/gameplay/server` session imports. Keep `match-state.ts` only as a temporary parity oracle.

## Tests

Cover creation/parsing, every match command, every rejection, non-mutating decisions, token ownership/revision/single-use, exact draft order, automatic terminal facts, and gameplay-session retention/disposal.

For every registered game, verify:

- selected gameplay session,
- active command and protocol fact,
- winner-determined without completion,
- frame award completion,
- match-winning terminal batch,
- warm apply equals cold replay and projection.

Replay tests cover sequence gaps, wrong first fact, duplicate creation, identity/config/breaker/index mismatch, command without frame, duplicate completion, missing or wrong terminal fact, causation mismatch, and facts after terminal.

Use old reducer parity only in tests and document deliberate automatic-terminal differences.

## Verification

```text
bun test packages/competition/src/sparring-match.test.ts
bun test packages/competition/src/sparring-match-replay.test.ts
bun run --cwd packages/competition typecheck
bun run check
```

## Exit Gate

- Competition can decide, apply, replay, and project complete matches for every game.
- One session owns one match actor and at most one gameplay session.
- Warm and cold state/projection are equal.
- Fact vocabulary and command causation are established.
- No MatchRoom-specific helper is required.
- New production APIs do not call the old reducer.

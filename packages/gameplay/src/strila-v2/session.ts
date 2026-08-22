import { type FrameOutcome } from '@ks/core'
import * as v from 'valibot'
import { type Actor, createActor, transition } from 'xstate'

import type { GameCreateStateArgs } from '../constants'
import {
  acceptDecision,
  buildPreparedResult,
  createPreparedTransition,
  type GameCommandDecision,
  type GameplaySession,
  GameplaySessionDisposedError,
  GameplaySessionUnusableError,
  InvalidPreparedTransitionError,
  isSessionOwnerActive,
  type PreparedGameCommandResult,
  type PreparedGameTransition,
  readPreparedTransition,
  registerSessionOwner,
  rejectedDecision,
  unregisterSessionOwner,
} from '../gameplay-session'
import {
  type StrilaCommand,
  StrilaCommandSchema,
  type StrilaContext,
  type StrilaFrameState,
  StrilaFrameStateSchema,
  type StrilaPhase,
} from './definitions'
import { createInitialSnapshot, getPhase, StrilaSparringFrameMachine, type StrilaSparringFrameSnapshot } from './machine'
import { deriveStrilaControlView } from './projections/control'
import { deriveStrilaScoreboardView } from './projections/scoreboard'
import { deriveStrilaSummaryView } from './projections/summary'
import { projectStrilaProtocolEntries } from './protocol'

function phaseToSnapshotValue(phase: StrilaPhase): StrilaSparringFrameSnapshot['value'] {
  switch (phase) {
    case 'foul-committed.penalty-selection':
      return { 'foul-committed': 'penalty-selection' }
    case 'foul-committed.ball-in-hand':
      return { 'foul-committed': 'ball-in-hand' }
    case 'respotted-black.opening':
      return { 'respotted-black': 'opening' }
    case 'respotted-black.play':
      return { 'respotted-black': 'play' }
    default:
      return phase
  }
}

function serializeSnapshot(snapshot: StrilaSparringFrameSnapshot): StrilaFrameState {
  return v.parse(StrilaFrameStateSchema, {
    ...snapshot.context,
    phase: getPhase(snapshot),
  })
}

function restoreSnapshot(state: StrilaFrameState): StrilaSparringFrameSnapshot {
  const snapshot = createInitialSnapshot(state.targetPoints)
  const { phase: _phase, ...context } = state
  return StrilaSparringFrameMachine.resolveState({
    ...snapshot,
    value: phaseToSnapshotValue(state.phase),
    context: context satisfies StrilaContext,
  })
}

function strilaOutcome(state: StrilaFrameState): FrameOutcome | undefined {
  if (state.phase !== 'frame-over' || state.winner === null || state.winnerDeterminationReason === null) return undefined
  return {
    winnerSeat: state.winner,
    score: state.score,
    winReason: 'target-reached',
  }
}

function isUnavailableBallPot(snapshot: StrilaSparringFrameSnapshot, event: StrilaCommand): boolean {
  if (event.type !== 'pot.record') return false
  for (const ball of event.pottedBalls) {
    if (ball !== 0 && !snapshot.context.coloredBallsOnTable.includes(ball)) return true
  }
  return false
}

function createActorFromSnapshot(snapshot: StrilaSparringFrameSnapshot): Actor<typeof StrilaSparringFrameMachine> {
  const actor = createActor(StrilaSparringFrameMachine, {
    snapshot,
    input: { targetPointsBySeat: snapshot.context.targetPoints },
  })
  actor.start()
  return actor
}

function snapshotsEqual(left: StrilaSparringFrameSnapshot, right: StrilaSparringFrameSnapshot): boolean {
  if (left === right) return true
  return (
    left.status === right.status &&
    JSON.stringify(left.value) === JSON.stringify(right.value) &&
    JSON.stringify(left.context) === JSON.stringify(right.context)
  )
}

class StrilaGameplaySession implements GameplaySession<'strila-v2'> {
  readonly gameKey = 'strila-v2' as const

  private readonly ownerId = Symbol('strila-gameplay-session')
  private readonly actor: Actor<typeof StrilaSparringFrameMachine>
  private revision = 0
  private disposed = false
  private unusable = false

  constructor(args: GameCreateStateArgs, restoredState?: StrilaFrameState) {
    registerSessionOwner(this.ownerId)
    const snapshot = restoredState ? restoreSnapshot(restoredState) : createInitialSnapshot(args.targetPointsBySeat)
    this.actor = createActorFromSnapshot(snapshot)
  }

  get state(): StrilaFrameState {
    this.assertActive()
    return serializeSnapshot(this.actor.getSnapshot())
  }

  decide(command: StrilaCommand): GameCommandDecision<'strila-v2'> {
    this.assertActive()

    const previousSnapshot = this.actor.getSnapshot()
    const previousState = serializeSnapshot(previousSnapshot)

    if (isUnavailableBallPot(previousSnapshot, command) || !previousSnapshot.can(command)) {
      return rejectedDecision()
    }

    const [candidateSnapshot] = transition(StrilaSparringFrameMachine, previousSnapshot, command)
    const candidateState = serializeSnapshot(candidateSnapshot)
    const candidateResult = buildPreparedResult<'strila-v2'>(
      candidateState,
      projectStrilaProtocolEntries({ previous: previousState, command, next: candidateState }),
      strilaOutcome(candidateState),
    )

    const prepared = createPreparedTransition<'strila-v2'>({
      gameKey: this.gameKey,
      ownerId: this.ownerId,
      revision: this.revision,
      previousState,
      parsedEvent: command,
      candidateResult,
      machineEvidence: {
        previousSnapshot: previousSnapshot,
        candidateSnapshot,
      },
    })

    return acceptDecision<'strila-v2'>(candidateResult, prepared)
  }

  applyCommitted(transitionToken: PreparedGameTransition<'strila-v2'>): PreparedGameCommandResult<'strila-v2'> {
    this.assertActive()

    const token = readPreparedTransition(transitionToken)
    if (!isSessionOwnerActive(token.ownerId)) {
      throw new InvalidPreparedTransitionError('Prepared transition owner is no longer active')
    }
    if (token.gameKey !== this.gameKey) throw new InvalidPreparedTransitionError('Prepared transition game key mismatch')
    if (token.ownerId !== this.ownerId) throw new InvalidPreparedTransitionError('Prepared transition owner mismatch')
    if (token.consumed) throw new InvalidPreparedTransitionError('Prepared transition was already consumed')

    const currentSnapshot = this.actor.getSnapshot()
    if (token.machineEvidence) {
      // SAFETY: Strila decide stores StrilaSparringFrameMachine snapshots in machineEvidence.
      const boundPrevious = token.machineEvidence.previousSnapshot as StrilaSparringFrameSnapshot
      if (!snapshotsEqual(currentSnapshot, boundPrevious)) {
        throw new InvalidPreparedTransitionError('Prepared transition previous snapshot mismatch')
      }
    } else {
      const currentState = serializeSnapshot(currentSnapshot)
      if (JSON.stringify(currentState) !== JSON.stringify(token.previousState)) {
        throw new InvalidPreparedTransitionError('Prepared transition previous state mismatch')
      }
    }

    if (token.revision !== this.revision) throw new InvalidPreparedTransitionError('Prepared transition revision is stale')

    if (!v.is(StrilaCommandSchema, token.parsedEvent)) {
      throw new InvalidPreparedTransitionError('Prepared transition parsed event mismatch')
    }
    this.actor.send(token.parsedEvent)

    const actualSnapshot = this.actor.getSnapshot()
    if (token.machineEvidence) {
      // SAFETY: Strila decide stores StrilaSparringFrameMachine snapshots in machineEvidence.
      const boundCandidate = token.machineEvidence.candidateSnapshot as StrilaSparringFrameSnapshot
      if (!snapshotsEqual(actualSnapshot, boundCandidate)) {
        this.markUnusable('Post-commit Strila candidate snapshot mismatch')
      }
    }

    const actualState = serializeSnapshot(actualSnapshot)
    const expectedState = token.candidateResult.state
    if (JSON.stringify(actualState) !== JSON.stringify(expectedState)) {
      this.markUnusable('Post-commit Strila state mismatch')
    }

    token.consumed = true
    this.revision += 1
    return token.candidateResult
  }

  deriveControl() {
    this.assertActive()
    return deriveStrilaControlView(this.state)
  }

  deriveSummary() {
    this.assertActive()
    return deriveStrilaSummaryView(this.state)
  }

  deriveScoreboard() {
    this.assertActive()
    return deriveStrilaScoreboardView(this.state)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    unregisterSessionOwner(this.ownerId)
    this.actor.stop()
  }

  private assertActive(): void {
    if (this.disposed) throw new GameplaySessionDisposedError()
    if (this.unusable) throw new GameplaySessionUnusableError('Strila gameplay session is unusable')
  }

  private markUnusable(reason: string): never {
    this.unusable = true
    unregisterSessionOwner(this.ownerId)
    this.actor.stop()
    throw new GameplaySessionUnusableError(reason)
  }
}

export function createStrilaGameplaySession(
  args: GameCreateStateArgs,
  restoredState?: StrilaFrameState,
): GameplaySession<'strila-v2'> {
  return new StrilaGameplaySession(args, restoredState)
}

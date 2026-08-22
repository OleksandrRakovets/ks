import { type ControlCommandPayload, type FrameOutcome } from '@ks/core'
import invariant from 'tiny-invariant'
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
import { ballsOnTableFromRacks, projectionDetailsFromState, totalScore } from './calculations'
import {
  type LongFreePyramidCommand,
  LongFreePyramidCommandSchema,
  type LongFreePyramidFrameState,
  LongFreePyramidFrameStateSchema,
  type LongFreePyramidPhase,
} from './definitions'
import {
  createInitialSnapshot,
  getPhase,
  type LongFreePyramidMachineInput,
  LongFreePyramidSparringFrameMachine,
  type LongFreePyramidSparringFrameSnapshot,
} from './machine'
import { deriveLongFreePyramidControlView } from './projections/control'
import { deriveLongFreePyramidScoreboardView } from './projections/scoreboard'
import { deriveLongFreePyramidSummaryView } from './projections/summary'
import { LongFreePyramidCommandPayloadSchemas, projectLongFreePyramidProtocolEntries } from './protocol'

function serializeSnapshot(snapshot: LongFreePyramidSparringFrameSnapshot): LongFreePyramidFrameState {
  return v.parse(LongFreePyramidFrameStateSchema, {
    racks: snapshot.context.racks,
    targetPointsBySeat: snapshot.context.targetPoints,
    rackRollover: snapshot.context.rackRollover,
    phase: getPhase(snapshot),
    messages: snapshot.context.messages,
    winner: snapshot.context.winner,
  })
}

function restoreSnapshot(state: LongFreePyramidFrameState): LongFreePyramidSparringFrameSnapshot {
  const snapshot = createInitialSnapshot({
    targetPointsBySeat: state.targetPointsBySeat,
    rackRollover: state.rackRollover,
  })
  return LongFreePyramidSparringFrameMachine.resolveState({
    ...snapshot,
    value: state.phase satisfies LongFreePyramidPhase,
    context: {
      racks: state.racks,
      targetPoints: state.targetPointsBySeat,
      rackRollover: state.rackRollover,
      winner: state.winner,
      messages: state.messages,
    },
  })
}

function longFreePyramidOutcome(state: LongFreePyramidFrameState): FrameOutcome | undefined {
  if (state.phase !== 'frame-over' || state.winner === null) return undefined
  return {
    winnerSeat: state.winner,
    score: totalScore(state.racks),
    winReason: 'target-reached',
  }
}

function isLongFreePyramidCommandPayloadType(
  commandType: string,
): commandType is keyof typeof LongFreePyramidCommandPayloadSchemas {
  return commandType in LongFreePyramidCommandPayloadSchemas
}

function parseLongFreePyramidCommand(commandType: string, command: ControlCommandPayload): LongFreePyramidCommand | null {
  if (!isLongFreePyramidCommandPayloadType(commandType)) {
    const parsed = v.safeParse(LongFreePyramidCommandSchema, { type: commandType })
    return parsed.success ? parsed.output : null
  }

  const payload = v.safeParse(v.looseObject({}), command)
  if (!payload.success) return null

  const parsed = v.safeParse(LongFreePyramidCommandSchema, { ...payload.output, type: commandType })
  return parsed.success ? parsed.output : null
}

function createActorFromSnapshot(
  snapshot: LongFreePyramidSparringFrameSnapshot,
): Actor<typeof LongFreePyramidSparringFrameMachine> {
  const actor = createActor(LongFreePyramidSparringFrameMachine, {
    snapshot,
    input: {
      targetPointsBySeat: snapshot.context.targetPoints,
      rackRollover: snapshot.context.rackRollover,
    },
  })
  actor.start()
  return actor
}

function snapshotsEqual(left: LongFreePyramidSparringFrameSnapshot, right: LongFreePyramidSparringFrameSnapshot): boolean {
  if (left === right) return true
  return (
    left.status === right.status &&
    JSON.stringify(left.value) === JSON.stringify(right.value) &&
    JSON.stringify(left.context) === JSON.stringify(right.context)
  )
}

function resolveMachineInput(args: GameCreateStateArgs): LongFreePyramidMachineInput {
  const rackRollover = args.gameConfiguration?.rackRollover
  invariant(rackRollover === 14 || rackRollover === 15, 'Long free pyramid requires rackRollover 14 or 15')
  return { targetPointsBySeat: args.targetPointsBySeat, rackRollover }
}

class LongFreePyramidGameplaySession implements GameplaySession<'free-pyramid-long'> {
  readonly gameKey = 'free-pyramid-long' as const

  private readonly ownerId = Symbol('long-free-pyramid-gameplay-session')
  private readonly actor: Actor<typeof LongFreePyramidSparringFrameMachine>
  private revision = 0
  private disposed = false
  private unusable = false

  constructor(args: GameCreateStateArgs, restoredState?: LongFreePyramidFrameState) {
    registerSessionOwner(this.ownerId)
    const snapshot = restoredState ? restoreSnapshot(restoredState) : createInitialSnapshot(resolveMachineInput(args))
    this.actor = createActorFromSnapshot(snapshot)
  }

  get state(): LongFreePyramidFrameState {
    this.assertActive()
    return serializeSnapshot(this.actor.getSnapshot())
  }

  decide(commandType: string, command: ControlCommandPayload): GameCommandDecision<'free-pyramid-long'> {
    this.assertActive()

    const parsed = parseLongFreePyramidCommand(commandType, command)
    if (!parsed) return rejectedDecision()

    const previousSnapshot = this.actor.getSnapshot()
    const previousState = serializeSnapshot(previousSnapshot)

    if (!previousSnapshot.can(parsed)) {
      return rejectedDecision()
    }

    const [candidateSnapshot] = transition(LongFreePyramidSparringFrameMachine, previousSnapshot, parsed)
    const candidateState = serializeSnapshot(candidateSnapshot)
    const candidateResult = buildPreparedResult<'free-pyramid-long'>(
      candidateState,
      projectLongFreePyramidProtocolEntries({ previous: previousState, command: parsed, next: candidateState }),
      longFreePyramidOutcome(candidateState),
    )

    const prepared = createPreparedTransition<'free-pyramid-long'>({
      gameKey: this.gameKey,
      ownerId: this.ownerId,
      revision: this.revision,
      previousState,
      parsedEvent: parsed,
      candidateResult,
      machineEvidence: {
        previousSnapshot: previousSnapshot,
        candidateSnapshot,
      },
    })

    return acceptDecision<'free-pyramid-long'>(candidateResult, prepared)
  }

  applyCommitted(transitionToken: PreparedGameTransition<'free-pyramid-long'>): PreparedGameCommandResult<'free-pyramid-long'> {
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
      // SAFETY: Long free pyramid decide stores machine snapshots in machineEvidence.
      const boundPrevious = token.machineEvidence.previousSnapshot as LongFreePyramidSparringFrameSnapshot
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

    if (!v.is(LongFreePyramidCommandSchema, token.parsedEvent)) {
      throw new InvalidPreparedTransitionError('Prepared transition parsed event mismatch')
    }
    this.actor.send(token.parsedEvent)

    const actualSnapshot = this.actor.getSnapshot()
    if (token.machineEvidence) {
      // SAFETY: Long free pyramid decide stores machine snapshots in machineEvidence.
      const boundCandidate = token.machineEvidence.candidateSnapshot as LongFreePyramidSparringFrameSnapshot
      if (!snapshotsEqual(actualSnapshot, boundCandidate)) {
        this.markUnusable('Post-commit LongFreePyramid candidate snapshot mismatch')
      }
    }

    const actualState = serializeSnapshot(actualSnapshot)
    const expectedState = token.candidateResult.state
    if (JSON.stringify(actualState) !== JSON.stringify(expectedState)) {
      this.markUnusable('Post-commit LongFreePyramid state mismatch')
    }

    token.consumed = true
    this.revision += 1
    return token.candidateResult
  }

  deriveControl() {
    this.assertActive()
    const state = this.state
    const score = totalScore(state.racks)
    const details = projectionDetailsFromState(state)
    return deriveLongFreePyramidControlView({
      state,
      score,
      details,
      ballsOnTable: ballsOnTableFromRacks(state.racks),
    })
  }

  deriveSummary() {
    this.assertActive()
    const state = this.state
    return deriveLongFreePyramidSummaryView({
      score: totalScore(state.racks),
      details: projectionDetailsFromState(state),
    })
  }

  deriveScoreboard() {
    this.assertActive()
    const state = this.state
    return deriveLongFreePyramidScoreboardView({
      score: totalScore(state.racks),
      details: projectionDetailsFromState(state),
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    unregisterSessionOwner(this.ownerId)
    this.actor.stop()
  }

  private assertActive(): void {
    if (this.disposed) throw new GameplaySessionDisposedError()
    if (this.unusable) throw new GameplaySessionUnusableError('Long free pyramid gameplay session is unusable')
  }

  private markUnusable(reason: string): never {
    this.unusable = true
    unregisterSessionOwner(this.ownerId)
    this.actor.stop()
    throw new GameplaySessionUnusableError(reason)
  }
}

export function createLongFreePyramidGameplaySession(
  args: GameCreateStateArgs,
  restoredState?: LongFreePyramidFrameState,
): GameplaySession<'free-pyramid-long'> {
  return new LongFreePyramidGameplaySession(args, restoredState)
}

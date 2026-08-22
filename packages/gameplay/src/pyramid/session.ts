import { type ControlCommandPayload, type FrameOutcome } from '@ks/core'
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
import type { ControlProjectionFor, ScoreboardProjectionFor, SummaryProjectionFor } from '../registry'
import {
  type PyramidCommand,
  PyramidCommandSchema,
  type PyramidFrameState,
  PyramidFrameStateSchema,
  type PyramidPhase,
} from './definitions'
import { createInitialSnapshot, getPhase, PyramidSparringFrameMachine, type PyramidSparringFrameSnapshot } from './machine'
import { derivePyramidControlView } from './projections/control'
import { derivePyramidScoreboardView } from './projections/scoreboard'
import { derivePyramidSummaryView } from './projections/summary'
import { projectPyramidProtocolEntries, PyramidCommandPayloadSchemas } from './protocol'
import { type PyramidGameKey, type PyramidRules, PyramidRuleSpecificsByGameKey } from './rules'

function serializeSnapshot(snapshot: PyramidSparringFrameSnapshot): PyramidFrameState {
  return v.parse(PyramidFrameStateSchema, {
    pointsBySeat: snapshot.context.score,
    targetPointsBySeat: snapshot.context.targetPoints,
    phase: getPhase(snapshot),
    winner: snapshot.context.winner,
  })
}

function restoreSnapshot(state: PyramidFrameState, rules: PyramidRules): PyramidSparringFrameSnapshot {
  const snapshot = createInitialSnapshot(rules, state.targetPointsBySeat)
  return PyramidSparringFrameMachine.resolveState({
    ...snapshot,
    value: state.phase satisfies PyramidPhase,
    context: {
      score: state.pointsBySeat,
      targetPoints: state.targetPointsBySeat,
      rules,
      winner: state.winner,
    },
  })
}

function pyramidOutcome(state: PyramidFrameState): FrameOutcome | undefined {
  if (state.phase !== 'frame-over' || state.winner === null) return undefined
  return {
    winnerSeat: state.winner,
    score: state.pointsBySeat,
    winReason: 'target-reached',
  }
}

function isPyramidCommandPayloadType(commandType: string): commandType is keyof typeof PyramidCommandPayloadSchemas {
  return commandType in PyramidCommandPayloadSchemas
}

function parsePyramidCommand(commandType: string, command: ControlCommandPayload): PyramidCommand | null {
  if (!isPyramidCommandPayloadType(commandType)) {
    const parsed = v.safeParse(PyramidCommandSchema, { type: commandType })
    return parsed.success ? parsed.output : null
  }

  const payload = v.safeParse(v.looseObject({}), command)
  if (!payload.success) return null

  const parsed = v.safeParse(PyramidCommandSchema, { ...payload.output, type: commandType })
  return parsed.success ? parsed.output : null
}

function createActorFromSnapshot(snapshot: PyramidSparringFrameSnapshot): Actor<typeof PyramidSparringFrameMachine> {
  const actor = createActor(PyramidSparringFrameMachine, {
    snapshot,
    input: { targetPointsBySeat: snapshot.context.targetPoints, rules: snapshot.context.rules },
  })
  actor.start()
  return actor
}

function snapshotsEqual(left: PyramidSparringFrameSnapshot, right: PyramidSparringFrameSnapshot): boolean {
  if (left === right) return true
  return (
    left.status === right.status &&
    JSON.stringify(left.value) === JSON.stringify(right.value) &&
    JSON.stringify(left.context) === JSON.stringify(right.context)
  )
}

class PyramidGameplaySession<K extends PyramidGameKey> implements GameplaySession<K> {
  readonly gameKey: K

  private readonly rules: PyramidRules
  private readonly ownerId = Symbol('pyramid-gameplay-session')
  private readonly actor: Actor<typeof PyramidSparringFrameMachine>
  private revision = 0
  private disposed = false
  private unusable = false

  constructor(gameKey: K, args: GameCreateStateArgs, restoredState?: PyramidFrameState) {
    registerSessionOwner(this.ownerId)
    this.gameKey = gameKey
    this.rules = PyramidRuleSpecificsByGameKey[gameKey]
    const snapshot = restoredState
      ? restoreSnapshot(restoredState, this.rules)
      : createInitialSnapshot(this.rules, args.targetPointsBySeat)
    this.actor = createActorFromSnapshot(snapshot)
  }

  get state(): PyramidFrameState {
    this.assertActive()
    return serializeSnapshot(this.actor.getSnapshot())
  }

  decide(commandType: string, command: ControlCommandPayload): GameCommandDecision<K> {
    this.assertActive()

    const parsed = parsePyramidCommand(commandType, command)
    if (!parsed) return rejectedDecision()

    const previousSnapshot = this.actor.getSnapshot()
    const previousState = serializeSnapshot(previousSnapshot)

    if (!previousSnapshot.can(parsed)) {
      return rejectedDecision()
    }

    const [candidateSnapshot] = transition(PyramidSparringFrameMachine, previousSnapshot, parsed)
    const candidateState = serializeSnapshot(candidateSnapshot)
    const candidateResult = buildPreparedResult<K>(
      // SAFETY: PyramidGameplaySession is only constructed for pyramid game keys whose state is PyramidFrameState.
      candidateState as GameplaySession<K>['state'],
      projectPyramidProtocolEntries({ previous: previousState, command: parsed, next: candidateState, rules: this.rules }),
      pyramidOutcome(candidateState),
    )

    const prepared = createPreparedTransition<K>({
      gameKey: this.gameKey,
      ownerId: this.ownerId,
      revision: this.revision,
      // SAFETY: PyramidGameplaySession is only constructed for pyramid game keys whose state is PyramidFrameState.
      previousState: previousState as GameplaySession<K>['state'],
      parsedEvent: parsed,
      candidateResult,
      machineEvidence: {
        previousSnapshot: previousSnapshot,
        candidateSnapshot,
      },
    })

    return acceptDecision<K>(candidateResult, prepared)
  }

  applyCommitted(transitionToken: PreparedGameTransition<K>): PreparedGameCommandResult<K> {
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
      // SAFETY: Pyramid decide stores PyramidSparringFrameMachine snapshots in machineEvidence.
      const boundPrevious = token.machineEvidence.previousSnapshot as PyramidSparringFrameSnapshot
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

    if (!v.is(PyramidCommandSchema, token.parsedEvent)) {
      throw new InvalidPreparedTransitionError('Prepared transition parsed event mismatch')
    }
    this.actor.send(token.parsedEvent)

    const actualSnapshot = this.actor.getSnapshot()
    if (token.machineEvidence) {
      // SAFETY: Pyramid decide stores PyramidSparringFrameMachine snapshots in machineEvidence.
      const boundCandidate = token.machineEvidence.candidateSnapshot as PyramidSparringFrameSnapshot
      if (!snapshotsEqual(actualSnapshot, boundCandidate)) {
        this.markUnusable('Post-commit Pyramid candidate snapshot mismatch')
      }
    }

    const actualState = serializeSnapshot(actualSnapshot)
    const expectedState = token.candidateResult.state
    if (JSON.stringify(actualState) !== JSON.stringify(expectedState)) {
      this.markUnusable('Post-commit Pyramid state mismatch')
    }

    token.consumed = true
    this.revision += 1
    return token.candidateResult
  }

  deriveControl(): ControlProjectionFor<K> {
    this.assertActive()
    // SAFETY: GameContracts maps every PyramidGameKey to PyramidControlViewFor<K>.
    return derivePyramidControlView(this.state, this.rules) as ControlProjectionFor<K>
  }

  deriveSummary(): SummaryProjectionFor<K> {
    this.assertActive()
    // SAFETY: GameContracts maps every PyramidGameKey to PyramidSummaryViewFor<K>.
    return derivePyramidSummaryView(this.state, this.rules) as SummaryProjectionFor<K>
  }

  deriveScoreboard(): ScoreboardProjectionFor<K> {
    this.assertActive()
    // SAFETY: GameContracts maps every PyramidGameKey to PyramidScoreboardViewFor<K>.
    return derivePyramidScoreboardView(this.state, this.rules) as ScoreboardProjectionFor<K>
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    unregisterSessionOwner(this.ownerId)
    this.actor.stop()
  }

  private assertActive(): void {
    if (this.disposed) throw new GameplaySessionDisposedError()
    if (this.unusable) throw new GameplaySessionUnusableError('Pyramid gameplay session is unusable')
  }

  private markUnusable(reason: string): never {
    this.unusable = true
    unregisterSessionOwner(this.ownerId)
    this.actor.stop()
    throw new GameplaySessionUnusableError(reason)
  }
}

export function createPyramidGameplaySession<K extends PyramidGameKey>(
  gameKey: K,
  args: GameCreateStateArgs,
  restoredState?: PyramidFrameState,
): GameplaySession<K> {
  return new PyramidGameplaySession(gameKey, args, restoredState)
}

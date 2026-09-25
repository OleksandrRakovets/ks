import { FrameOutcome, type Seat } from '@ks/core'
import * as v from 'valibot'
import { transition } from 'xstate'

import {
  commandNotAvailable,
  type GameCommandExecution,
  type GameplaySession,
  type GameplaySessionCreateArgsFor,
} from '../gameplay-session'
import { StrilaCheckpoint, type StrilaCommand, StrilaSnapshotValue } from './definitions'
import {
  createInitialSnapshot,
  getStrilaFramePhase,
  StrilaFrameMachine,
  type StrilaFrameSnapshot,
} from './machine'
import { deriveStrilaControlProjection } from './projections/control'
import { createStrilaProtocolEntries } from './protocol'

class StrilaGameplaySession implements GameplaySession<'strila-v2'> {
  readonly gameKey = 'strila-v2' as const
  #snapshot: StrilaFrameSnapshot

  constructor(args: GameplaySessionCreateArgsFor<'strila-v2'>, checkpoint?: StrilaCheckpoint) {
    this.#snapshot = checkpoint
      ? StrilaFrameMachine.resolveState(checkpoint)
      : createInitialSnapshot({ ...args.targetPointsBySeat })
  }

  exportCheckpoint(): StrilaCheckpoint {
    return { value: v.parse(StrilaSnapshotValue, this.#snapshot.value), context: this.#snapshot.context }
  }

  execute(command: StrilaCommand): GameCommandExecution {
    const previous = this.#snapshot

    if (!previous.can(command)) return commandNotAvailable()
    const [candidate] = transition(StrilaFrameMachine, previous, command)
    const gameProtocolEntries = createStrilaProtocolEntries({ previous, command, next: candidate })
    const outcome = candidate.status === 'done' ? candidate.output : undefined

    if (outcome !== undefined && !v.is(FrameOutcome, outcome))
      throw new Error('Strila machine produced an invalid outcome')

    const result = outcome
      ? { _tag: 'accepted' as const, gameProtocolEntries, outcome }
      : { _tag: 'accepted' as const, gameProtocolEntries }

    this.#snapshot = candidate

    return result
  }

  getScore() {
    return { ...this.#snapshot.context.score }
  }
  canCommence(seat: Seat) {
    return this.#snapshot.can({ type: 'frame.commence', seat })
  }
  canConcede() {
    const phase = getStrilaFramePhase(this.#snapshot)

    return phase !== 'winner-determined' && phase !== 'frame-over'
  }
  deriveControls() {
    return deriveStrilaControlProjection(this.#snapshot)
  }
}

export function createStrilaGameplaySession(
  args: GameplaySessionCreateArgsFor<'strila-v2'>,
): GameplaySession<'strila-v2'> {
  return new StrilaGameplaySession(args)
}

export function restoreStrilaGameplaySession(checkpoint: StrilaCheckpoint): GameplaySession<'strila-v2'> {
  const state = v.parse(StrilaCheckpoint, checkpoint)

  if (
    state.value === 'frame-over' ||
    (state.value === 'winner-determined') !== (state.context.winner !== null) ||
    (v.is(v.object({ 'foul-committed': v.literal('penalty-selection') }), state.value) &&
      state.context.foulOffender === null) ||
    (v.is(v.object({ 'respotted-black': v.string() }), state.value) &&
      state.context.coloredBallsOnTable.join(',') !== '7')
  )
    throw new Error('Inconsistent Strila checkpoint')

  return new StrilaGameplaySession({ targetPointsBySeat: state.context.targetPoints }, state)
}

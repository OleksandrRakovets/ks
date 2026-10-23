import { FrameOutcome, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'
import { transition } from 'xstate'

import {
  commandNotAvailable,
  type GameCommandExecution,
  type GameplaySession,
  type GameplaySessionCreateArgsFor,
} from '../gameplay-session'
import { StrilaCheckpoint, type StrilaCommand, StrilaSnapshotValue } from './definitions'
import { createInitialSnapshot, getPhase, StrilaFrameMachine, type StrilaFrameSnapshot } from './machine'
import { deriveStrilaControlProjection } from './projections/control'
import { createStrilaProtocolEntries } from './protocol'

class StrilaGameplaySession implements GameplaySession<'strila-v2'> {
  readonly gameKey = 'strila-v2' as const
  #snapshot: StrilaFrameSnapshot

  constructor(snapshot: StrilaFrameSnapshot) {
    this.#snapshot = snapshot
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

    invariant(
      outcome === undefined || v.is(FrameOutcome, outcome),
      'Strila machine produced an invalid outcome',
    )

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
    const phase = getPhase(this.#snapshot)

    return phase !== 'winner-determined' && phase !== 'frame-over'
  }
  deriveControls() {
    return deriveStrilaControlProjection(this.#snapshot)
  }
}

export function createStrilaGameplaySession(
  args: GameplaySessionCreateArgsFor<'strila-v2'>,
): GameplaySession<'strila-v2'> {
  return new StrilaGameplaySession(createInitialSnapshot({ ...args.targetPointsBySeat }))
}

export function restoreStrilaGameplaySession(checkpoint: StrilaCheckpoint): GameplaySession<'strila-v2'> {
  invariant(checkpoint.value !== 'frame-over', 'Cannot restore completed Strila frame')
  invariant(
    (checkpoint.value === 'winner-determined') === (checkpoint.context.winner !== null),
    'Strila winner must match phase',
  )

  const snapshot = StrilaFrameMachine.resolveState(checkpoint)

  if (snapshot.matches({ 'foul-committed': 'penalty-selection' }))
    invariant(snapshot.context.foulOffender !== null, 'Penalty selection requires foul offender')

  if (snapshot.matches('respotted-black'))
    invariant(
      snapshot.context.coloredBallsOnTable.length === 1 && snapshot.context.coloredBallsOnTable[0] === 7,
      'Respotted black requires only black ball',
    )

  return new StrilaGameplaySession(snapshot)
}

import { FrameOutcome, type Seat } from '@ks/core'
import * as v from 'valibot'
import { transition } from 'xstate'

import {
  commandNotAvailable,
  type GameCommandExecution,
  type GameplaySession,
  type GameplaySessionCreateArgsFor,
} from '../gameplay-session'
import { totalScore } from './calculations'
import type { LongFreePyramidCommand } from './definitions'
import {
  createInitialSnapshot,
  getPhase,
  LongFreePyramidSparringFrameMachine,
  type LongFreePyramidSparringFrameSnapshot,
} from './machine'
import { deriveLongFreePyramidControlProjection } from './projections/control'
import { createLongFreePyramidProtocolEntries } from './protocol'

class LongFreePyramidGameplaySession implements GameplaySession<'free-pyramid-long'> {
  readonly gameKey = 'free-pyramid-long' as const
  #snapshot: LongFreePyramidSparringFrameSnapshot

  constructor(args: GameplaySessionCreateArgsFor<'free-pyramid-long'>) {
    this.#snapshot = createInitialSnapshot({
      targetPointsBySeat: { ...args.targetPointsBySeat },
      rackRollover: args.rackRollover,
    })
  }

  execute(command: LongFreePyramidCommand): GameCommandExecution {
    const previous = this.#snapshot
    if (!previous.can(command)) return commandNotAvailable()
    const [candidate] = transition(LongFreePyramidSparringFrameMachine, previous, command)
    const gameProtocolEntries = createLongFreePyramidProtocolEntries({ previous, command, next: candidate })
    const outcome = candidate.status === 'done' ? candidate.output : undefined
    if (outcome !== undefined && !v.is(FrameOutcome, outcome))
      throw new Error('Long free Pyramid machine produced an invalid outcome')
    const result = outcome
      ? { _tag: 'accepted' as const, gameProtocolEntries, outcome }
      : { _tag: 'accepted' as const, gameProtocolEntries }
    this.#snapshot = candidate
    return result
  }

  getScore() {
    return totalScore(this.#snapshot.context.racks)
  }
  canCommence(seat: Seat) {
    return this.#snapshot.can({ type: 'frame.commence', seat })
  }
  canConcede() {
    const phase = getPhase(this.#snapshot)
    return phase !== 'winner-determined' && phase !== 'awaiting-award' && phase !== 'frame-over'
  }
  deriveControls() {
    return deriveLongFreePyramidControlProjection(this.#snapshot)
  }
}

export function createLongFreePyramidGameplaySession(
  args: GameplaySessionCreateArgsFor<'free-pyramid-long'>,
): GameplaySession<'free-pyramid-long'> {
  return new LongFreePyramidGameplaySession(args)
}

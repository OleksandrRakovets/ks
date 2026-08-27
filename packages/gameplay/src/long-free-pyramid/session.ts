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
  LongFreePyramidSparringFrameMachine,
  type LongFreePyramidSparringFrameSnapshot,
} from './machine'
import { deriveLongFreePyramidControlView } from './projections/control'
import { projectLongFreePyramidProtocolEntries } from './protocol'

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
    const projected = projectLongFreePyramidProtocolEntries({ previous, command, next: candidate })
    const output = candidate.status === 'done' ? candidate.output : undefined
    if (output !== undefined && !v.is(FrameOutcome, output))
      throw new Error('Long free Pyramid machine produced an invalid outcome')
    const outcome = output
    const result = outcome
      ? { _tag: 'accepted' as const, gameProtocolEntries: projected, outcome }
      : { _tag: 'accepted' as const, gameProtocolEntries: projected }
    this.#snapshot = candidate
    return result
  }

  getScore() {
    return totalScore(this.#snapshot.context.racks)
  }
  canCommence(seat: Seat) {
    return this.#snapshot.can({ type: 'frame.commence', seat })
  }
  deriveControl() {
    return deriveLongFreePyramidControlView(this.#snapshot)
  }
}

export function createLongFreePyramidGameplaySession(
  args: GameplaySessionCreateArgsFor<'free-pyramid-long'>,
): GameplaySession<'free-pyramid-long'> {
  return new LongFreePyramidGameplaySession(args)
}

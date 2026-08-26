import { FrameOutcomeSchema, ProtocolEntrySchema, type Seat } from '@ks/core'
import * as v from 'valibot'
import { transition } from 'xstate'

import {
  commandNotAvailable,
  type GameCommandExecution,
  type GameplaySession,
  type GameplaySessionCreateArgsFor,
  type NonEmptyProtocolEntries,
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
    // Validate semantic output before retaining the candidate, despite both producers being internally typed.
    const projected = projectLongFreePyramidProtocolEntries({ previous, command, next: candidate })
    if (!v.is(v.array(ProtocolEntrySchema), projected))
      throw new Error('Accepted long free Pyramid command produced invalid protocol entries')
    if (!projected[0]) throw new Error('Accepted long free Pyramid command produced no protocol entries')
    const protocolEntries: NonEmptyProtocolEntries = [projected[0], ...projected.slice(1)]
    const output = candidate.status === 'done' ? candidate.output : undefined
    if (output !== undefined && !v.is(FrameOutcomeSchema, output))
      throw new Error('Long free Pyramid machine produced an invalid outcome')
    const outcome = output
    const result = outcome
      ? { _tag: 'accepted' as const, protocolEntries, outcome }
      : { _tag: 'accepted' as const, protocolEntries }
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

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
import { LongFreePyramidCheckpoint, type LongFreePyramidCommand } from './definitions'
import {
  createInitialSnapshot,
  getPhase,
  LongFreePyramidFrameMachine,
  type LongFreePyramidFrameSnapshot,
} from './machine'
import { deriveLongFreePyramidControlProjection } from './projections/control'
import { createLongFreePyramidProtocolEntries } from './protocol'

class LongFreePyramidGameplaySession implements GameplaySession<'free-pyramid-long'> {
  readonly gameKey = 'free-pyramid-long' as const
  #snapshot: LongFreePyramidFrameSnapshot

  constructor(
    args: GameplaySessionCreateArgsFor<'free-pyramid-long'>,
    checkpoint?: LongFreePyramidCheckpoint,
  ) {
    this.#snapshot = checkpoint
      ? LongFreePyramidFrameMachine.resolveState(checkpoint)
      : createInitialSnapshot({
          targetPointsBySeat: { ...args.targetPointsBySeat },
          rackRollover: args.rackRollover,
        })
  }

  exportCheckpoint(): LongFreePyramidCheckpoint {
    return {
      value: this.#snapshot.value,
      context: this.#snapshot.context,
    }
  }

  execute(command: LongFreePyramidCommand): GameCommandExecution {
    const previous = this.#snapshot

    if (!previous.can(command)) return commandNotAvailable()
    const [candidate] = transition(LongFreePyramidFrameMachine, previous, command)
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
  deriveResult() {
    return {
      gameKey: this.gameKey,
      racks: this.#snapshot.context.racks.map((rack) => ({
        rackNumber: rack.rackNumber,
        scoreBySeat: { ...rack.scoreBySeat },
      })),
    }
  }
}

export function createLongFreePyramidGameplaySession(
  args: GameplaySessionCreateArgsFor<'free-pyramid-long'>,
): GameplaySession<'free-pyramid-long'> {
  return new LongFreePyramidGameplaySession(args)
}

export function restoreLongFreePyramidGameplaySession(
  checkpoint: LongFreePyramidCheckpoint,
): GameplaySession<'free-pyramid-long'> {
  const state = v.parse(LongFreePyramidCheckpoint, checkpoint)

  if (
    state.value === 'frame-over' ||
    (state.value === 'winner-determined' || state.value === 'awaiting-award') !==
      (state.context.winner !== null) ||
    state.context.racks.some(
      (rack, index) =>
        rack.rackNumber !== index + 1 ||
        rack.scoreBySeat.A < 0 ||
        rack.scoreBySeat.B < 0 ||
        rack.scoreBySeat.A + rack.scoreBySeat.B > 16,
    )
  )
    throw new Error('Inconsistent long pyramid checkpoint')

  return new LongFreePyramidGameplaySession(
    { targetPointsBySeat: state.context.targetPoints, rackRollover: state.context.rackRollover },
    state,
  )
}

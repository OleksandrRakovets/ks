import { FrameOutcome, type Seat } from '@ks/core'
import { Schema } from 'effect'
import invariant from 'tiny-invariant'
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

type Seat = typeof Seat.Type

type LongFreePyramidCheckpoint = typeof LongFreePyramidCheckpoint.Type

type LongFreePyramidCommand = typeof LongFreePyramidCommand.Type

class LongFreePyramidGameplaySession implements GameplaySession<'free-pyramid-long'> {
  readonly gameKey = 'free-pyramid-long' as const
  #snapshot: LongFreePyramidFrameSnapshot

  constructor(snapshot: LongFreePyramidFrameSnapshot) {
    this.#snapshot = snapshot
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

    invariant(
      outcome === undefined || Schema.is(FrameOutcome)(outcome),
      'Long free Pyramid machine produced an invalid outcome',
    )

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
  return new LongFreePyramidGameplaySession(
    createInitialSnapshot({
      targetPointsBySeat: { ...args.targetPointsBySeat },
      rackRollover: args.rackRollover,
    }),
  )
}

export function restoreLongFreePyramidGameplaySession(
  checkpoint: LongFreePyramidCheckpoint,
): GameplaySession<'free-pyramid-long'> {
  invariant(checkpoint.value !== 'frame-over', 'Cannot restore completed long Pyramid frame')
  invariant(
    (checkpoint.value === 'winner-determined' || checkpoint.value === 'awaiting-award') ===
      (checkpoint.context.winner !== null),
    'Long Pyramid winner must match phase',
  )

  for (const [index, rack] of checkpoint.context.racks.entries()) {
    invariant(rack.rackNumber === index + 1, 'Long Pyramid rack numbers must be consecutive from 1')
    invariant(
      rack.scoreBySeat.A >= 0 && rack.scoreBySeat.B >= 0,
      'Long Pyramid rack scores must be nonnegative',
    )
    invariant(rack.scoreBySeat.A + rack.scoreBySeat.B <= 16, 'Long Pyramid rack score must not exceed 16')
  }

  return new LongFreePyramidGameplaySession(LongFreePyramidFrameMachine.resolveState(checkpoint))
}

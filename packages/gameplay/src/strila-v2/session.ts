import { FrameOutcome, type Seat } from '@ks/core'
import * as v from 'valibot'
import { transition } from 'xstate'

import {
  commandNotAvailable,
  type GameCommandExecution,
  type GameplaySession,
  type GameplaySessionCreateArgsFor,
} from '../gameplay-session'
import type { StrilaCommand } from './definitions'
import {
  createInitialSnapshot,
  getStrilaSparringFramePhase,
  StrilaSparringFrameMachine,
  type StrilaSparringFrameSnapshot,
} from './machine'
import { deriveStrilaControlProjection } from './projections/control'
import { createStrilaProtocolEntries } from './protocol'

class StrilaGameplaySession implements GameplaySession<'strila-v2'> {
  readonly gameKey = 'strila-v2' as const
  #snapshot: StrilaSparringFrameSnapshot

  constructor(args: GameplaySessionCreateArgsFor<'strila-v2'>) {
    this.#snapshot = createInitialSnapshot({ ...args.targetPointsBySeat })
  }

  execute(command: StrilaCommand): GameCommandExecution {
    const previous = this.#snapshot

    if (!previous.can(command)) return commandNotAvailable()
    const [candidate] = transition(StrilaSparringFrameMachine, previous, command)
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
    const phase = getStrilaSparringFramePhase(this.#snapshot)

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

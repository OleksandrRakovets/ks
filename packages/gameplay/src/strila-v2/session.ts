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
import type { StrilaCommand } from './definitions'
import { createInitialSnapshot, StrilaSparringFrameMachine, type StrilaSparringFrameSnapshot } from './machine'
import { deriveStrilaControlView } from './projections/control'
import { projectStrilaProtocolEntries } from './protocol'

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
    // Validate semantic output before retaining the candidate, despite both producers being internally typed.
    const projected = projectStrilaProtocolEntries({ previous, command, next: candidate })
    if (!v.is(v.array(ProtocolEntrySchema), projected))
      throw new Error('Accepted Strila command produced invalid protocol entries')
    if (!projected[0]) throw new Error('Accepted Strila command produced no protocol entries')
    const protocolEntries: NonEmptyProtocolEntries = [projected[0], ...projected.slice(1)]
    const output = candidate.status === 'done' ? candidate.output : undefined
    if (output !== undefined && !v.is(FrameOutcomeSchema, output)) throw new Error('Strila machine produced an invalid outcome')
    const outcome = output
    const result = outcome
      ? { _tag: 'accepted' as const, protocolEntries, outcome }
      : { _tag: 'accepted' as const, protocolEntries }
    this.#snapshot = candidate
    return result
  }

  getScore() {
    return { ...this.#snapshot.context.score }
  }
  canCommence(seat: Seat) {
    return this.#snapshot.can({ type: 'frame.commence', seat })
  }
  deriveControl() {
    return deriveStrilaControlView(this.#snapshot)
  }
}

export function createStrilaGameplaySession(args: GameplaySessionCreateArgsFor<'strila-v2'>): GameplaySession<'strila-v2'> {
  return new StrilaGameplaySession(args)
}

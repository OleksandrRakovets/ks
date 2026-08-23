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
import type { ControlProjectionFor } from '../registry'
import type { PyramidCommand } from './definitions'
import { createInitialSnapshot, PyramidSparringFrameMachine, type PyramidSparringFrameSnapshot } from './machine'
import { derivePyramidControlView } from './projections/control'
import { projectPyramidProtocolEntries } from './protocol'
import { type PyramidGameKey, type PyramidRulesFor, PyramidRuleSpecificsByGameKey } from './rules'

class PyramidGameplaySession<K extends PyramidGameKey> implements GameplaySession<K> {
  readonly gameKey: K
  #snapshot: PyramidSparringFrameSnapshot
  #rules: PyramidRulesFor<K>

  constructor(gameKey: K, args: GameplaySessionCreateArgsFor<K>) {
    this.gameKey = gameKey
    // SAFETY: the exhaustive rules registry entry and game key are indexed by the same K.
    // @ts-expect-error TypeScript does not preserve the dependent key while indexing the exhaustive rules registry.
    this.#rules = PyramidRuleSpecificsByGameKey[gameKey]
    this.#snapshot = createInitialSnapshot(this.#rules, { ...args.targetPointsBySeat })
  }

  execute(command: PyramidCommand): GameCommandExecution {
    const previous = this.#snapshot
    if (!previous.can(command)) return commandNotAvailable()
    const [candidate] = transition(PyramidSparringFrameMachine, previous, command)
    // Validate semantic output before retaining the candidate, despite both producers being internally typed.
    const projected = projectPyramidProtocolEntries({ previous, command, next: candidate, rules: this.#rules })
    if (!v.is(v.array(ProtocolEntrySchema), projected))
      throw new Error('Accepted Pyramid command produced invalid protocol entries')
    if (!projected[0]) throw new Error('Accepted Pyramid command produced no protocol entries')
    const protocolEntries: NonEmptyProtocolEntries = [projected[0], ...projected.slice(1)]
    const output = candidate.status === 'done' ? candidate.output : undefined
    if (output !== undefined && !v.is(FrameOutcomeSchema, output))
      throw new Error('Pyramid machine produced an invalid outcome')
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
  deriveControl(): ControlProjectionFor<K> {
    // @ts-expect-error TypeScript does not preserve K through the family control schema implementation.
    return derivePyramidControlView(this.#snapshot, this.#rules)
  }
}

export function createPyramidGameplaySession<K extends PyramidGameKey>(
  gameKey: K,
  args: GameplaySessionCreateArgsFor<K>,
): GameplaySession<K> {
  return new PyramidGameplaySession(gameKey, args)
}

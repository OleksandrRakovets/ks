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

  constructor(gameKey: K, args: GameplaySessionCreateArgsFor<K>, rules: PyramidRulesFor<K>) {
    this.gameKey = gameKey
    this.#rules = rules
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
    // SAFETY: both the family projection and registry contract are discriminated by this session's same K.
    return derivePyramidControlView(this.#snapshot, this.#rules) as ControlProjectionFor<K>
  }
}

type PyramidGameplaySessionCreation = {
  [K in PyramidGameKey]: readonly [gameKey: K, args: GameplaySessionCreateArgsFor<K>]
}[PyramidGameKey]
type AnyPyramidGameplaySession = { [K in PyramidGameKey]: GameplaySession<K> }[PyramidGameKey]

export function createPyramidGameplaySession<K extends PyramidGameKey>(
  gameKey: K,
  args: GameplaySessionCreateArgsFor<K>,
): GameplaySession<K>
export function createPyramidGameplaySession(...creation: PyramidGameplaySessionCreation): AnyPyramidGameplaySession {
  switch (creation[0]) {
    case 'free-pyramid':
      return new PyramidGameplaySession(creation[0], creation[1], PyramidRuleSpecificsByGameKey['free-pyramid'])
    case 'combined-pyramid':
      return new PyramidGameplaySession(creation[0], creation[1], PyramidRuleSpecificsByGameKey['combined-pyramid'])
    case 'combined-pyramid-old':
      return new PyramidGameplaySession(creation[0], creation[1], PyramidRuleSpecificsByGameKey['combined-pyramid-old'])
  }
}

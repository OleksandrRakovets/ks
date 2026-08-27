import { FrameOutcomeSchema, type Seat } from '@ks/core'
import * as v from 'valibot'
import { transition } from 'xstate'

import {
  commandNotAvailable,
  type GameCommandExecution,
  type GameplaySession,
  type GameplaySessionCreateArgsFor,
} from '../gameplay-session'
import type { ControlProjectionFor } from '../registry'
import type { PyramidCommand } from './definitions'
import {
  createInitialSnapshot,
  PyramidSparringFrameMachine,
  type PyramidSparringFrameSnapshot,
} from './machine'
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
    const projected = projectPyramidProtocolEntries({ previous, command, next: candidate, rules: this.#rules })
    const output = candidate.status === 'done' ? candidate.output : undefined
    if (output !== undefined && !v.is(FrameOutcomeSchema, output))
      throw new Error('Pyramid machine produced an invalid outcome')
    const outcome = output
    const result = outcome
      ? { _tag: 'accepted' as const, gameProtocolEntries: projected, outcome }
      : { _tag: 'accepted' as const, gameProtocolEntries: projected }
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
export function createPyramidGameplaySession(
  ...creation: PyramidGameplaySessionCreation
): AnyPyramidGameplaySession {
  switch (creation[0]) {
    case 'free-pyramid':
      return new PyramidGameplaySession(
        creation[0],
        creation[1],
        PyramidRuleSpecificsByGameKey['free-pyramid'],
      )
    case 'combined-pyramid':
      return new PyramidGameplaySession(
        creation[0],
        creation[1],
        PyramidRuleSpecificsByGameKey['combined-pyramid'],
      )
    case 'combined-pyramid-old':
      return new PyramidGameplaySession(
        creation[0],
        creation[1],
        PyramidRuleSpecificsByGameKey['combined-pyramid-old'],
      )
  }
}

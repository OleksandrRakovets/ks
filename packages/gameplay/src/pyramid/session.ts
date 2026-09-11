import { FrameOutcome, type Seat } from '@ks/core'
import * as v from 'valibot'
import { transition } from 'xstate'

import type { GameControl } from '../constants'
import {
  commandNotAvailable,
  type GameCommandExecution,
  type GameplaySession,
  type GameplaySessionCreateArgsFor,
} from '../gameplay-session'
import type { GamePresentationFor } from '../registry'
import type { PyramidCommand } from './definitions'
import {
  createInitialSnapshot,
  getPhase,
  PyramidSparringFrameMachine,
  type PyramidSparringFrameSnapshot,
} from './machine'
import { derivePyramidControlProjection } from './projections/control'
import { createPyramidProtocolEntries } from './protocol'
import { type PyramidGameKey, type PyramidRulesFor, PyramidRuleSpecificsByGameKey } from './rules'

class PyramidGameplaySession<K extends PyramidGameKey> implements GameplaySession<K> {
  readonly gameKey: K
  #snapshot: PyramidSparringFrameSnapshot
  readonly #rules: PyramidRulesFor<K>

  constructor(gameKey: K, args: GameplaySessionCreateArgsFor<K>, rules: PyramidRulesFor<K>) {
    this.gameKey = gameKey
    this.#rules = rules
    this.#snapshot = createInitialSnapshot(this.#rules, { ...args.targetPointsBySeat })
  }

  execute(command: PyramidCommand): GameCommandExecution {
    const previous = this.#snapshot

    if (!previous.can(command)) return commandNotAvailable()
    const [candidate] = transition(PyramidSparringFrameMachine, previous, command)

    const gameProtocolEntries = createPyramidProtocolEntries({
      previous,
      command,
      next: candidate,
      rules: this.#rules,
    })

    const outcome = candidate.status === 'done' ? candidate.output : undefined

    if (outcome !== undefined && !v.is(FrameOutcome, outcome))
      throw new Error('Pyramid machine produced an invalid outcome')

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
    const phase = getPhase(this.#snapshot)

    return phase !== 'winner-determined' && phase !== 'frame-over'
  }
  deriveControls(): { readonly game: GamePresentationFor<K>; readonly controls: readonly GameControl[] } {
    const projection: unknown = derivePyramidControlProjection(this.#snapshot, this.#rules)

    // SAFETY: TypeScript cannot reduce the registry's indexed presentation type for generic K;
    // the projection and registry entry are both selected by this session's same game key.
    return projection as { readonly game: GamePresentationFor<K>; readonly controls: readonly GameControl[] }
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

  throw new Error('Unsupported pyramid game')
}

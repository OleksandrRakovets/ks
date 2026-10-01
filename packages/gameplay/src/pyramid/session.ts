import { FrameOutcome, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
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
import { PyramidCheckpoint, type PyramidCommand } from './definitions'
import { createInitialSnapshot, getPhase, PyramidFrameMachine, type PyramidFrameSnapshot } from './machine'
import { derivePyramidControlProjection } from './projections/control'
import { createPyramidProtocolEntries } from './protocol'
import { type PyramidGameKey, type PyramidRulesFor, PyramidRuleSpecificsByGameKey } from './rules'

class PyramidGameplaySession<K extends PyramidGameKey> implements GameplaySession<K> {
  readonly gameKey: K
  #snapshot: PyramidFrameSnapshot
  readonly #rules: PyramidRulesFor<K>

  constructor(gameKey: K, rules: PyramidRulesFor<K>, snapshot: PyramidFrameSnapshot) {
    this.gameKey = gameKey
    this.#rules = rules
    this.#snapshot = snapshot
  }

  exportCheckpoint(): PyramidCheckpoint {
    return { value: this.#snapshot.value, context: this.#snapshot.context }
  }

  execute(command: PyramidCommand): GameCommandExecution {
    const previous = this.#snapshot

    if (!previous.can(command)) return commandNotAvailable()
    const [candidate] = transition(PyramidFrameMachine, previous, command)

    const gameProtocolEntries = createPyramidProtocolEntries({
      previous,
      command,
      next: candidate,
      rules: this.#rules,
    })

    const outcome = candidate.status === 'done' ? candidate.output : undefined

    invariant(
      outcome === undefined || v.is(FrameOutcome, outcome),
      'Pyramid machine produced an invalid outcome',
    )

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
        PyramidRuleSpecificsByGameKey['free-pyramid'],
        createInitialSnapshot(PyramidRuleSpecificsByGameKey['free-pyramid'], {
          ...creation[1].targetPointsBySeat,
        }),
      )
    case 'combined-pyramid':
      return new PyramidGameplaySession(
        creation[0],
        PyramidRuleSpecificsByGameKey['combined-pyramid'],
        createInitialSnapshot(PyramidRuleSpecificsByGameKey['combined-pyramid'], {
          ...creation[1].targetPointsBySeat,
        }),
      )
    case 'combined-pyramid-old':
      return new PyramidGameplaySession(
        creation[0],
        PyramidRuleSpecificsByGameKey['combined-pyramid-old'],
        createInitialSnapshot(PyramidRuleSpecificsByGameKey['combined-pyramid-old'], {
          ...creation[1].targetPointsBySeat,
        }),
      )
  }

  throw new Error('Unsupported pyramid game')
}

export function restorePyramidGameplaySession<K extends PyramidGameKey>(
  gameKey: K,
  checkpoint: PyramidCheckpoint,
): GameplaySession<K> {
  const rules = PyramidRuleSpecificsByGameKey[gameKey]

  invariant(
    !(
      checkpoint.value === 'frame-over' ||
      checkpoint.context.rules.gameKey !== gameKey ||
      checkpoint.context.rules.allowNegative !== rules.allowNegative ||
      checkpoint.context.rules.foulPenalty !== rules.foulPenalty ||
      checkpoint.context.rules.shotPointOptions.length !== rules.shotPointOptions.length ||
      checkpoint.context.rules.shotPointOptions.some(
        (option, index) => option !== rules.shotPointOptions[index],
      ) ||
      (checkpoint.value === 'winner-determined') !== (checkpoint.context.winner !== null)
    ),
    'Pyramid checkpoint rules or phase do not match the game',
  )

  // SAFETY: indexed rules correspond to the selected key.
  return new PyramidGameplaySession(
    gameKey,
    checkpoint.context.rules as PyramidRulesFor<K>,
    PyramidFrameMachine.resolveState(checkpoint),
  )
}

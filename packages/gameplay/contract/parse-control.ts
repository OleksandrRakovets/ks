import * as v from 'valibot'

import { type GameControlProjection } from '../src/constants'
import { type ControlProjectionFor, type RegisteredGameKey, registry } from '../src/registry'

/**
 * Validates an advertised MatchRoom control projection for one registered game.
 *
 * @param gameKey - The registered game selecting the exact control schema.
 * @param input - The typed wire representation, which still requires runtime validation at the RPC trust seam.
 * @returns The canonical control projection correlated with `gameKey`.
 */
export function parseGameControl<K extends RegisteredGameKey>(
  gameKey: K,
  input: GameControlProjection,
): ControlProjectionFor<K> {
  return v.parse(registry[gameKey].controlSchema, input)
}

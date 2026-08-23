import * as v from 'valibot'

import type { GameplaySession, GameplaySessionCreateArgsFor } from './gameplay-session'
import { LongFreePyramidCommandSchema } from './long-free-pyramid/definitions'
import { createLongFreePyramidGameplaySession } from './long-free-pyramid/session'
import { PyramidCommandSchema } from './pyramid/definitions'
import { createPyramidGameplaySession } from './pyramid/session'
import type { GameCommandFor, RegisteredGameKey } from './registry'
import { StrilaCommandSchema } from './strila-v2/definitions'
import { createStrilaGameplaySession } from './strila-v2/session'

type GameplayServerEntry<K extends RegisteredGameKey> = {
  readonly commandSchema: v.GenericSchema<GameCommandFor<K>>
  readonly create: (args: GameplaySessionCreateArgsFor<K>) => GameplaySession<K>
}
type GameplayServerRegistry = { readonly [K in RegisteredGameKey]: GameplayServerEntry<K> }

const gameplayServerRegistry = {
  'strila-v2': { commandSchema: StrilaCommandSchema, create: createStrilaGameplaySession },
  'free-pyramid': { commandSchema: PyramidCommandSchema, create: (args) => createPyramidGameplaySession('free-pyramid', args) },
  'free-pyramid-long': { commandSchema: LongFreePyramidCommandSchema, create: createLongFreePyramidGameplaySession },
  'combined-pyramid': {
    commandSchema: PyramidCommandSchema,
    create: (args) => createPyramidGameplaySession('combined-pyramid', args),
  },
  'combined-pyramid-old': {
    commandSchema: PyramidCommandSchema,
    create: (args) => createPyramidGameplaySession('combined-pyramid-old', args),
  },
} satisfies GameplayServerRegistry

export function getGameplayRegistryEntry<K extends RegisteredGameKey>(gameKey: K): GameplayServerEntry<K> {
  // SAFETY: the exhaustive registry entry and its creator both use the same registered game key.
  // @ts-expect-error TypeScript does not preserve the dependent key while indexing the exhaustive registry.
  return gameplayServerRegistry[gameKey]
}

/**
 * Creates fresh gameplay at the initial machine snapshot.
 *
 * @param gameKey - The registered game selecting one private family implementation.
 * @param args - Creation input correlated with that game key.
 * @returns Fresh gameplay waiting for frame commencement.
 * @throws An unrecoverable defect when the private registry is incomplete or machine input is invalid.
 */
export function createGameplaySession<K extends RegisteredGameKey>(
  gameKey: K,
  args: GameplaySessionCreateArgsFor<K>,
): GameplaySession<K> {
  return getGameplayRegistryEntry(gameKey).create(args)
}

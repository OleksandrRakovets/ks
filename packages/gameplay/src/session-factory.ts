import type { GameplaySession, GameplaySessionCreateArgsFor } from './gameplay-session'
import { createLongFreePyramidGameplaySession } from './long-free-pyramid/session'
import { createPyramidGameplaySession } from './pyramid/session'
import type { RegisteredGameKey } from './registry'
import { createStrilaGameplaySession } from './strila-v2/session'

type GameplaySessionCreation = {
  [K in RegisteredGameKey]: readonly [gameKey: K, args: GameplaySessionCreateArgsFor<K>]
}[RegisteredGameKey]
type AnyGameplaySession = { [K in RegisteredGameKey]: GameplaySession<K> }[RegisteredGameKey]

/**
 * Creates fresh gameplay at the initial machine snapshot.
 *
 * @param gameKey - The registered game selecting one private family implementation.
 * @param args - Creation input correlated with that game key.
 * @returns Fresh gameplay waiting for frame commencement.
 * @throws An unrecoverable defect when machine input is invalid.
 */
export function createGameplaySession<K extends RegisteredGameKey>(
  gameKey: K,
  args: GameplaySessionCreateArgsFor<K>,
): GameplaySession<K>
export function createGameplaySession(...creation: GameplaySessionCreation): AnyGameplaySession {
  switch (creation[0]) {
    case 'strila-v2':
      return createStrilaGameplaySession(creation[1])
    case 'free-pyramid':
      return createPyramidGameplaySession('free-pyramid', creation[1])
    case 'free-pyramid-long':
      return createLongFreePyramidGameplaySession(creation[1])
    case 'combined-pyramid':
      return createPyramidGameplaySession('combined-pyramid', creation[1])
    case 'combined-pyramid-old':
      return createPyramidGameplaySession('combined-pyramid-old', creation[1])
  }

  throw new Error('Unsupported registered game')
}

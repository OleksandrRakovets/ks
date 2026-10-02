import type { GameplaySession, GameplaySessionCreateArgsFor } from './gameplay-session'
import {
  createLongFreePyramidGameplaySession,
  restoreLongFreePyramidGameplaySession,
} from './long-free-pyramid/session'
import { createPyramidGameplaySession, restorePyramidGameplaySession } from './pyramid/session'
import type { GameKey, GameplayCheckpoint } from './registry'
import { createStrilaGameplaySession, restoreStrilaGameplaySession } from './strila-v2/session'

type GameKey = typeof GameKey.Type

type GameplayCheckpoint = typeof GameplayCheckpoint.Type

export function restoreGameplaySession(checkpoint: GameplayCheckpoint): AnyGameplaySession {
  switch (checkpoint.gameKey) {
    case 'strila-v2':
      return restoreStrilaGameplaySession(checkpoint.state)
    case 'free-pyramid-long':
      return restoreLongFreePyramidGameplaySession(checkpoint.state)
    case 'free-pyramid':
      return restorePyramidGameplaySession(checkpoint.gameKey, checkpoint.state)
    case 'combined-pyramid':
      return restorePyramidGameplaySession(checkpoint.gameKey, checkpoint.state)
    case 'combined-pyramid-old':
      return restorePyramidGameplaySession(checkpoint.gameKey, checkpoint.state)
  }

  throw new Error('Unsupported registered game')
}

type GameplaySessionCreation = {
  [K in GameKey]: readonly [gameKey: K, args: GameplaySessionCreateArgsFor<K>]
}[GameKey]

type AnyGameplaySession = { [K in GameKey]: GameplaySession<K> }[GameKey]

/**
 * Creates fresh gameplay at the initial machine snapshot.
 *
 * @param gameKey - The registered game selecting one private family implementation.
 * @param args - Creation input correlated with that game key.
 * @returns Fresh gameplay waiting for frame commencement.
 * @throws An unrecoverable defect when machine input is invalid.
 */
export function createGameplaySession<K extends GameKey>(
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

import * as v from 'valibot'

import type { GameplaySession, GameplaySessionCreateArgsFor } from './gameplay-session'
import {
  createLongFreePyramidGameplaySession,
  LongFreePyramidCheckpoint,
  restoreLongFreePyramidGameplaySession,
} from './long-free-pyramid/session'
import {
  createPyramidGameplaySession,
  PyramidCheckpoint,
  restorePyramidGameplaySession,
} from './pyramid/session'
import type { RegisteredGameKey } from './registry'
import {
  createStrilaGameplaySession,
  restoreStrilaGameplaySession,
  StrilaCheckpoint,
} from './strila-v2/session'

/** Correlates the game key with its complete executable frame state. */
export const GameplayCheckpoint = v.variant('gameKey', [
  v.object({ gameKey: v.literal('strila-v2'), state: StrilaCheckpoint }),
  v.object({ gameKey: v.literal('free-pyramid-long'), state: LongFreePyramidCheckpoint }),
  v.object({ gameKey: v.literal('free-pyramid'), state: PyramidCheckpoint }),
  v.object({ gameKey: v.literal('combined-pyramid'), state: PyramidCheckpoint }),
  v.object({ gameKey: v.literal('combined-pyramid-old'), state: PyramidCheckpoint }),
])

export type GameplayCheckpoint = v.InferOutput<typeof GameplayCheckpoint>

export function restoreGameplaySession(checkpoint: GameplayCheckpoint): AnyGameplaySession {
  const parsed = v.parse(GameplayCheckpoint, checkpoint)

  switch (parsed.gameKey) {
    case 'strila-v2':
      return restoreStrilaGameplaySession(parsed.state)
    case 'free-pyramid-long':
      return restoreLongFreePyramidGameplaySession(parsed.state)
    case 'free-pyramid':
      return restorePyramidGameplaySession(parsed.gameKey, parsed.state)
    case 'combined-pyramid':
      return restorePyramidGameplaySession(parsed.gameKey, parsed.state)
    case 'combined-pyramid-old':
      return restorePyramidGameplaySession(parsed.gameKey, parsed.state)
  }

  throw new Error('Unsupported registered game')
}

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

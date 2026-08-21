import type { GameCreateStateArgs } from './constants'
import type { GameplaySession, GameplaySessionFactoryArgs } from './gameplay-session'
import { createLongFreePyramidLegacyGameplaySession } from './long-free-pyramid/legacy-session'
import { createPyramidLegacyGameplaySession } from './pyramid/legacy-session'
import type { GameStateFor, RegisteredGameKey } from './registry'
import { createStrilaGameplaySession } from './strila-v2/session'

function asGameplaySession<K extends RegisteredGameKey>(session: GameplaySession<RegisteredGameKey>): GameplaySession<K> {
  // SAFETY: The caller's exhaustive switch selected the branch that produced this session for K.
  return session as GameplaySession<K>
}

export function createGameplaySession<K extends RegisteredGameKey>(
  gameKey: K,
  args: GameplaySessionFactoryArgs,
): GameplaySession<K> {
  switch (gameKey) {
    case 'strila-v2':
      return asGameplaySession(createStrilaGameplaySession(args))
    case 'free-pyramid':
      return asGameplaySession(
        createPyramidLegacyGameplaySession(
          {
            gameKey: 'free-pyramid',
            allowNegative: false,
            foulPenalty: 'opponent-plus-one',
            shotPointOptions: [1, 2, 4],
          },
          args,
        ),
      )
    case 'free-pyramid-long':
      return asGameplaySession(createLongFreePyramidLegacyGameplaySession(args))
    case 'combined-pyramid':
      return asGameplaySession(
        createPyramidLegacyGameplaySession(
          {
            gameKey: 'combined-pyramid',
            allowNegative: false,
            foulPenalty: 'opponent-plus-one',
            shotPointOptions: [1, 2],
          },
          args,
        ),
      )
    case 'combined-pyramid-old':
      return asGameplaySession(
        createPyramidLegacyGameplaySession(
          {
            gameKey: 'combined-pyramid-old',
            allowNegative: true,
            foulPenalty: 'offender-minus-one',
            shotPointOptions: [1, 2],
          },
          args,
        ),
      )
  }
}

export function restoreGameplaySession<K extends RegisteredGameKey>(
  gameKey: K,
  state: GameStateFor<K>,
  args: GameCreateStateArgs,
): GameplaySession<K> {
  switch (gameKey) {
    case 'strila-v2': {
      // SAFETY: restoreGameplaySession's exhaustive switch selected the strila-v2 branch for K.
      const strilaState = state as GameStateFor<'strila-v2'>
      return asGameplaySession(createStrilaGameplaySession(args, strilaState))
    }
    case 'free-pyramid': {
      // SAFETY: restoreGameplaySession's exhaustive switch selected the free-pyramid branch for K.
      const pyramidState = state as GameStateFor<'free-pyramid'>
      return asGameplaySession(
        createPyramidLegacyGameplaySession(
          {
            gameKey: 'free-pyramid',
            allowNegative: false,
            foulPenalty: 'opponent-plus-one',
            shotPointOptions: [1, 2, 4],
          },
          args,
          pyramidState,
        ),
      )
    }
    case 'free-pyramid-long': {
      // SAFETY: restoreGameplaySession's exhaustive switch selected the free-pyramid-long branch for K.
      const longState = state as GameStateFor<'free-pyramid-long'>
      return asGameplaySession(createLongFreePyramidLegacyGameplaySession(args, longState))
    }
    case 'combined-pyramid': {
      // SAFETY: restoreGameplaySession's exhaustive switch selected the combined-pyramid branch for K.
      const pyramidState = state as GameStateFor<'combined-pyramid'>
      return asGameplaySession(
        createPyramidLegacyGameplaySession(
          {
            gameKey: 'combined-pyramid',
            allowNegative: false,
            foulPenalty: 'opponent-plus-one',
            shotPointOptions: [1, 2],
          },
          args,
          pyramidState,
        ),
      )
    }
    case 'combined-pyramid-old': {
      // SAFETY: restoreGameplaySession's exhaustive switch selected the combined-pyramid-old branch for K.
      const pyramidState = state as GameStateFor<'combined-pyramid-old'>
      return asGameplaySession(
        createPyramidLegacyGameplaySession(
          {
            gameKey: 'combined-pyramid-old',
            allowNegative: true,
            foulPenalty: 'offender-minus-one',
            shotPointOptions: [1, 2],
          },
          args,
          pyramidState,
        ),
      )
    }
  }
}

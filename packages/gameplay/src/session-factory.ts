import type { GameCreateStateArgs } from './constants'
import type { GameplaySession, GameplaySessionFactoryArgs } from './gameplay-session'
import { createLongFreePyramidLegacyGameplaySession } from './long-free-pyramid/legacy-session'
import type { PyramidRuntimeConfig } from './pyramid/definitions'
import { createPyramidLegacyGameplaySession } from './pyramid/legacy-session'
import type { GameStateFor, RegisteredGameKey } from './registry'
import { createStrilaGameplaySession } from './strila-v2/session'

type GameplaySessionFactory<K extends RegisteredGameKey> = {
  create(args: GameplaySessionFactoryArgs): GameplaySession<K>
  restore(state: GameStateFor<K>, args: GameCreateStateArgs): GameplaySession<K>
  createArgsFromState(state: GameStateFor<K>): GameCreateStateArgs
}

type GameplaySessionFactories = {
  [K in RegisteredGameKey]: GameplaySessionFactory<K>
}

const freePyramidConfig = {
  gameKey: 'free-pyramid',
  allowNegative: false,
  foulPenalty: 'opponent-plus-one',
  shotPointOptions: [1, 2, 4],
} satisfies PyramidRuntimeConfig<'free-pyramid'>

const combinedPyramidConfig = {
  gameKey: 'combined-pyramid',
  allowNegative: false,
  foulPenalty: 'opponent-plus-one',
  shotPointOptions: [1, 2],
} satisfies PyramidRuntimeConfig<'combined-pyramid'>

const combinedPyramidOldConfig = {
  gameKey: 'combined-pyramid-old',
  allowNegative: true,
  foulPenalty: 'offender-minus-one',
  shotPointOptions: [1, 2],
} satisfies PyramidRuntimeConfig<'combined-pyramid-old'>

const gameplaySessionFactories: GameplaySessionFactories = {
  'strila-v2': {
    create: createStrilaGameplaySession,
    restore: (state, args) => createStrilaGameplaySession(args, state),
    createArgsFromState: (state) => ({ targetPointsBySeat: state.targetPoints, breakerSeat: 'A' }),
  },
  'free-pyramid': {
    create: (args) => createPyramidLegacyGameplaySession(freePyramidConfig, args),
    restore: (state, args) => createPyramidLegacyGameplaySession(freePyramidConfig, args, state),
    createArgsFromState: (state) => ({ targetPointsBySeat: state.targetPointsBySeat, breakerSeat: 'A' }),
  },
  'free-pyramid-long': {
    create: createLongFreePyramidLegacyGameplaySession,
    restore: (state, args) => createLongFreePyramidLegacyGameplaySession(args, state),
    createArgsFromState: (state) => ({
      targetPointsBySeat: state.targetPointsBySeat,
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: state.rackRollover },
    }),
  },
  'combined-pyramid': {
    create: (args) => createPyramidLegacyGameplaySession(combinedPyramidConfig, args),
    restore: (state, args) => createPyramidLegacyGameplaySession(combinedPyramidConfig, args, state),
    createArgsFromState: (state) => ({ targetPointsBySeat: state.targetPointsBySeat, breakerSeat: 'A' }),
  },
  'combined-pyramid-old': {
    create: (args) => createPyramidLegacyGameplaySession(combinedPyramidOldConfig, args),
    restore: (state, args) => createPyramidLegacyGameplaySession(combinedPyramidOldConfig, args, state),
    createArgsFromState: (state) => ({ targetPointsBySeat: state.targetPointsBySeat, breakerSeat: 'A' }),
  },
}

export function createGameplaySession<K extends RegisteredGameKey>(
  gameKey: K,
  args: GameplaySessionFactoryArgs,
): GameplaySession<K> {
  return gameplaySessionFactories[gameKey].create(args)
}

export function restoreGameplaySession<K extends RegisteredGameKey>(
  gameKey: K,
  state: GameStateFor<K>,
  args: GameCreateStateArgs,
): GameplaySession<K> {
  return gameplaySessionFactories[gameKey].restore(state, args)
}

export function createGameplaySessionArgsFromState<K extends RegisteredGameKey>(
  gameKey: K,
  state: GameStateFor<K>,
): GameCreateStateArgs {
  return gameplaySessionFactories[gameKey].createArgsFromState(state)
}

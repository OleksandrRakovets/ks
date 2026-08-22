import * as v from 'valibot'

import type { GameCreateStateArgs } from './constants'
import type { GameplaySession, GameplaySessionFactoryArgs } from './gameplay-session'
import { LongFreePyramidCommandSchema } from './long-free-pyramid/definitions'
import { createLongFreePyramidGameplaySession } from './long-free-pyramid/session'
import { PyramidCommandSchema } from './pyramid/definitions'
import { createPyramidGameplaySession } from './pyramid/session'
import type { GameCommandFor, GameStateFor, RegisteredGameKey } from './registry'
import { StrilaCommandSchema } from './strila-v2/definitions'
import { createStrilaGameplaySession } from './strila-v2/session'

type GameplayRegistryEntry<K extends RegisteredGameKey> = {
  create(args: GameplaySessionFactoryArgs): GameplaySession<K>
  restore(state: GameStateFor<K>, args: GameCreateStateArgs): GameplaySession<K>
  createArgsFromState(state: GameStateFor<K>): GameCreateStateArgs
  commandSchema: v.GenericSchema<GameCommandFor<K>>
}

type GameplayRegistry = {
  [K in RegisteredGameKey]: GameplayRegistryEntry<K>
}

const gameplayRegistry: GameplayRegistry = {
  'strila-v2': {
    create: createStrilaGameplaySession,
    restore: (state, args) => createStrilaGameplaySession(args, state),
    createArgsFromState: (state) => ({ targetPointsBySeat: state.targetPoints, breakerSeat: 'A' }),
    commandSchema: StrilaCommandSchema,
  },
  'free-pyramid': {
    create: (args) => createPyramidGameplaySession('free-pyramid', args),
    restore: (state, args) => createPyramidGameplaySession('free-pyramid', args, state),
    createArgsFromState: (state) => ({ targetPointsBySeat: state.targetPointsBySeat, breakerSeat: 'A' }),
    commandSchema: PyramidCommandSchema,
  },
  'free-pyramid-long': {
    create: createLongFreePyramidGameplaySession,
    restore: (state, args) => createLongFreePyramidGameplaySession(args, state),
    createArgsFromState: (state) => ({
      targetPointsBySeat: state.targetPointsBySeat,
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: state.rackRollover },
    }),
    commandSchema: LongFreePyramidCommandSchema,
  },
  'combined-pyramid': {
    create: (args) => createPyramidGameplaySession('combined-pyramid', args),
    restore: (state, args) => createPyramidGameplaySession('combined-pyramid', args, state),
    createArgsFromState: (state) => ({ targetPointsBySeat: state.targetPointsBySeat, breakerSeat: 'A' }),
    commandSchema: PyramidCommandSchema,
  },
  'combined-pyramid-old': {
    create: (args) => createPyramidGameplaySession('combined-pyramid-old', args),
    restore: (state, args) => createPyramidGameplaySession('combined-pyramid-old', args, state),
    createArgsFromState: (state) => ({ targetPointsBySeat: state.targetPointsBySeat, breakerSeat: 'A' }),
    commandSchema: PyramidCommandSchema,
  },
}

export function getGameplayRegistryEntry<K extends RegisteredGameKey>(gameKey: K): GameplayRegistryEntry<K> {
  const entry = gameplayRegistry[gameKey]
  if (!entry) throw new Error(`Missing gameplay registry entry for game key: ${gameKey}`)
  return entry
}

export function createGameplaySession<K extends RegisteredGameKey>(
  gameKey: K,
  args: GameplaySessionFactoryArgs,
): GameplaySession<K> {
  return gameplayRegistry[gameKey].create(args)
}

export function restoreGameplaySession<K extends RegisteredGameKey>(
  gameKey: K,
  state: GameStateFor<K>,
  args: GameCreateStateArgs,
): GameplaySession<K> {
  return gameplayRegistry[gameKey].restore(state, args)
}

export function createGameplaySessionArgsFromState<K extends RegisteredGameKey>(
  gameKey: K,
  state: GameStateFor<K>,
): GameCreateStateArgs {
  return gameplayRegistry[gameKey].createArgsFromState(state)
}

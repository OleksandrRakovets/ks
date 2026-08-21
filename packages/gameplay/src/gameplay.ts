import { GameKeySchema } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { type GameCommandResult, type GameControlProjectionInput, type GameCreateStateArgs } from './constants'
import { LongFreePyramidControlViewSchema } from './long-free-pyramid/definitions'
import {
  CombinedPyramidControlViewSchema,
  CombinedPyramidOldControlViewSchema,
  FreePyramidControlViewSchema,
} from './pyramid/definitions'
import {
  type ControlProjectionFor,
  type GameStateFor,
  isRegisteredGameKey,
  type RegisteredGameKey,
  type ScoreboardProjectionFor,
  type SummaryProjectionFor,
} from './registry'
import { getGameplayRuntime } from './runtime-factory'
import { StrilaControlViewSchema } from './strila-v2/definitions'

export function parseGameKey(value: string): RegisteredGameKey {
  const gameKey = v.parse(GameKeySchema, value)
  invariant(isRegisteredGameKey(gameKey), `Unsupported game key: ${gameKey}`)
  return gameKey
}

export function createInitialGameState<K extends RegisteredGameKey>(gameKey: K, args: GameCreateStateArgs): GameStateFor<K> {
  return getGameplayRuntime(gameKey).createInitialState(args)
}

export function applyGameCommand<K extends RegisteredGameKey>(args: {
  gameKey: K
  state: GameStateFor<K>
  commandType: string
  command: unknown
}): GameCommandResult<GameStateFor<K>> {
  return getGameplayRuntime(args.gameKey).applyCommand({
    state: args.state,
    commandType: args.commandType,
    command: args.command,
  })
}

export function deriveGameControl<K extends RegisteredGameKey>(gameKey: K, state: GameStateFor<K>): ControlProjectionFor<K> {
  return getGameplayRuntime(gameKey).deriveControl(state)
}

export function parseGameControl<K extends RegisteredGameKey>(
  gameKey: K,
  input: GameControlProjectionInput,
): ControlProjectionFor<K> {
  let projection: ControlProjectionFor<RegisteredGameKey>
  switch (gameKey) {
    case 'strila-v2':
      projection = v.parse(StrilaControlViewSchema, input)
      break
    case 'free-pyramid':
      projection = v.parse(FreePyramidControlViewSchema, input)
      break
    case 'free-pyramid-long':
      projection = v.parse(LongFreePyramidControlViewSchema, input)
      break
    case 'combined-pyramid':
      projection = v.parse(CombinedPyramidControlViewSchema, input)
      break
    case 'combined-pyramid-old':
      projection = v.parse(CombinedPyramidOldControlViewSchema, input)
      break
  }
  if (projection.gameKey !== gameKey) throw new Error('Control projection game key does not match expected game')
  // SAFETY: The schema selected by gameKey parsed the projection and its literal gameKey was checked above.
  return projection as ControlProjectionFor<K>
}

export function deriveGameScoreboard<K extends RegisteredGameKey>(
  gameKey: K,
  state: GameStateFor<K>,
): ScoreboardProjectionFor<K> {
  return getGameplayRuntime(gameKey).deriveScoreboard(state)
}

export function deriveGameSummary<K extends RegisteredGameKey>(gameKey: K, state: GameStateFor<K>): SummaryProjectionFor<K> {
  return getGameplayRuntime(gameKey).deriveSummary(state)
}

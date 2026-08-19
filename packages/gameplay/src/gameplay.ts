import { GameKeySchema } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { GameProjectionKeySchema, type GameCommandResult, type GameCreateStateArgs, type GameProjectionKey } from './constants'
import { isRegisteredGameKey, type RegisteredGameKey } from './registry'
import { getGameplayRuntime } from './runtime-factory'

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- SAFETY: REVIEW_POST_REFACTOR
export function parseGameKey(value: unknown): RegisteredGameKey {
  const gameKey = v.parse(GameKeySchema, value)
  invariant(isRegisteredGameKey(gameKey), `Unsupported game key: ${gameKey}`)
  return gameKey
}

// oxlint-disable-next-line anti-slop/no-unknown-returns -- SAFETY: REVIEW_POST_REFACTOR
export function createInitialGameState(gameKey: RegisteredGameKey, args: GameCreateStateArgs): unknown {
  return getGameplayRuntime(gameKey).createInitialState(args)
}

export function applyGameCommand(args: { gameKey: RegisteredGameKey; state: unknown; commandType: string; command: unknown }): {
  state: unknown
  outcome?: GameCommandResult['outcome']
  protocolEntries: GameCommandResult['protocolEntries']
} {
  return getGameplayRuntime(args.gameKey).applyCommand({
    state: args.state,
    commandType: args.commandType,
    command: args.command,
  })
}

/* oxlint-disable anti-slop/no-unknown-returns -- SAFETY: REVIEW_POST_REFACTOR */
export function deriveGameProjection(args: {
  gameKey: RegisteredGameKey
  state: unknown
  projection: GameProjectionKey
}): unknown {
  return getGameplayRuntime(args.gameKey).deriveProjection({
    state: args.state,
    projection: v.parse(GameProjectionKeySchema, args.projection),
  })
}
/* oxlint-enable anti-slop/no-unknown-returns */

import { GameKeySchema } from '@ks/core'
import invariant from 'tiny-invariant'

import { GameProjectionKeySchema, type GameProjectionKey } from './abstract-runtime'
import { getGameplayRuntime, isRegisteredGameKey, type RegisteredGameKey } from './registry'

export function parseGameKey(value: unknown): RegisteredGameKey {
  const gameKey = GameKeySchema.parse(value)
  invariant(isRegisteredGameKey(gameKey), `Unsupported game key: ${gameKey}`)
  return gameKey
}

export function createInitialGameState(gameKey: RegisteredGameKey): unknown {
  return getGameplayRuntime(gameKey).createInitialState()
}

export function applyGameCommand(args: { gameKey: RegisteredGameKey; state: unknown; commandType: string; command: unknown }): {
  state: unknown
  protocolEntries?: unknown[]
} {
  return getGameplayRuntime(args.gameKey).applyCommand({
    state: args.state,
    commandType: args.commandType,
    command: args.command,
  })
}

export function deriveGameProjection(args: {
  gameKey: RegisteredGameKey
  state: unknown
  projection: GameProjectionKey
}): unknown {
  return getGameplayRuntime(args.gameKey).deriveProjection({
    state: args.state,
    projection: GameProjectionKeySchema.parse(args.projection),
  })
}

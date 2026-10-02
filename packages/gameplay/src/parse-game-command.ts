import type { MatchCommand } from '@ks/core'
import { Result, Schema } from 'effect'

import { type GameCommandFor, type GameKey, registry } from './registry'

type GameKey = typeof GameKey.Type

type GameCommandParseFailure = {
  readonly _tag: 'game-command-parse-failure'
  readonly gameKey: GameKey
  readonly commandType: string
  readonly error: Schema.SchemaError
}

export type ParseGameCommandResult<K extends GameKey> =
  | { readonly _tag: 'parsed'; readonly command: GameCommandFor<K> }
  | GameCommandParseFailure

export function parseGameCommand<K extends GameKey>(
  gameKey: K,
  input: (typeof MatchCommand.Type)['command'],
): ParseGameCommandResult<K> {
  const parsed = Schema.decodeUnknownResult(registry[gameKey].commandSchema)(input)

  if (Result.isFailure(parsed)) {
    const discriminator = Schema.decodeUnknownResult(Schema.Struct({ type: Schema.String }))(input)
    const commandType = Result.isSuccess(discriminator) ? discriminator.success.type : 'unknown'

    return { _tag: 'game-command-parse-failure', gameKey, commandType, error: parsed.failure }
  }

  return { _tag: 'parsed', command: parsed.success }
}

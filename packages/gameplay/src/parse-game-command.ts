import * as v from 'valibot'

import { GameCommandTransportPayloadSchema } from './command-schemas'
import { type GameCommandFor, type RegisteredGameKey, registry } from './registry'

export type GameCommandParseFailure = {
  readonly _tag: 'game-command-parse-failure'
  readonly gameKey: RegisteredGameKey
  readonly commandType: string
  readonly issues: readonly v.BaseIssue<unknown>[]
}

export type ParseGameCommandResult<K extends RegisteredGameKey> =
  | { readonly _tag: 'parsed'; readonly command: GameCommandFor<K> }
  | GameCommandParseFailure

function parseFailure<K extends RegisteredGameKey>(
  gameKey: K,
  commandType: string,
  issues: readonly v.BaseIssue<unknown>[],
): GameCommandParseFailure {
  return { _tag: 'game-command-parse-failure', gameKey, commandType, issues }
}

export function parseGameCommand<K extends RegisteredGameKey>(
  gameKey: K,
  input: { readonly commandType: string; readonly command: unknown },
): ParseGameCommandResult<K> {
  const schema = registry[gameKey].commandSchema

  const payload = v.safeParse(GameCommandTransportPayloadSchema, input.command)
  if (!payload.success) {
    return parseFailure(gameKey, input.commandType, payload.issues)
  }

  const candidate = { ...payload.output, type: input.commandType }
  const parsed = v.safeParse(schema, candidate)
  if (!parsed.success) {
    return parseFailure(gameKey, input.commandType, parsed.issues)
  }

  // SAFETY: schema is keyed to gameKey in the exhaustive registry entry above.
  return { _tag: 'parsed', command: parsed.output as GameCommandFor<K> }
}

import type { MatchCommand } from '@ks/core'
import * as v from 'valibot'

import { type GameCommandFor, type RegisteredGameKey, registry } from './registry'

type GameCommandParseFailure = {
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
  input: MatchCommand['command'],
): ParseGameCommandResult<K> {
  const schema = registry[gameKey].commandSchema
  const parsed = v.safeParse(schema, input)
  if (!parsed.success) {
    const discriminator = v.safeParse(v.object({ type: v.string() }), input)
    const commandType = discriminator.success ? discriminator.output.type : 'unknown'
    return parseFailure(gameKey, commandType, parsed.issues)
  }

  // SAFETY: schema is keyed to gameKey in the exhaustive registry entry above.
  return { _tag: 'parsed', command: parsed.output as GameCommandFor<K> }
}

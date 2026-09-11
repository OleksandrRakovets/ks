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

function parseFailure(
  gameKey: RegisteredGameKey,
  commandType: string,
  issues: readonly v.BaseIssue<unknown>[],
): GameCommandParseFailure {
  return { _tag: 'game-command-parse-failure', gameKey, commandType, issues }
}

export function parseGameCommand<K extends RegisteredGameKey>(
  gameKey: K,
  input: MatchCommand['command'],
): ParseGameCommandResult<K> {
  const parsed = v.safeParse(registry[gameKey].commandSchema, input)
  if (!parsed.success) {
    const discriminator = v.safeParse(v.object({ type: v.string() }), input)
    const commandType = discriminator.success ? discriminator.output.type : 'unknown'
    return parseFailure(gameKey, commandType, parsed.issues)
  }

  return { _tag: 'parsed', command: parsed.output }
}

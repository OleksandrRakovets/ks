import * as v from 'valibot'

import { type GameControlProjectionInput } from '../src/constants'
import { LongFreePyramidControlViewSchema } from '../src/long-free-pyramid/definitions'
import {
  CombinedPyramidControlViewSchema,
  CombinedPyramidOldControlViewSchema,
  FreePyramidControlViewSchema,
} from '../src/pyramid/definitions'
import { type ControlProjectionFor, type RegisteredGameKey } from '../src/registry'
import { StrilaControlViewSchema } from '../src/strila-v2/definitions'

type GameControlParser<K extends RegisteredGameKey> = (input: GameControlProjectionInput) => ControlProjectionFor<K>

type GameControlParsers = {
  [K in RegisteredGameKey]: GameControlParser<K>
}

const gameControlParsers: GameControlParsers = {
  'strila-v2': (input) => v.parse(StrilaControlViewSchema, input),
  'free-pyramid': (input) => v.parse(FreePyramidControlViewSchema, input),
  'free-pyramid-long': (input) => v.parse(LongFreePyramidControlViewSchema, input),
  'combined-pyramid': (input) => v.parse(CombinedPyramidControlViewSchema, input),
  'combined-pyramid-old': (input) => v.parse(CombinedPyramidOldControlViewSchema, input),
}

export function parseGameControl<K extends RegisteredGameKey>(
  gameKey: K,
  input: GameControlProjectionInput,
): ControlProjectionFor<K> {
  return gameControlParsers[gameKey](input)
}

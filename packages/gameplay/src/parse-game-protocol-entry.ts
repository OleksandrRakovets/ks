import type { GameProtocolEntry } from '@ks/core'
import * as v from 'valibot'

import {
  LongFreePyramidProtocolEntry,
  type LongFreePyramidProtocolEntry as LongFreePyramidProtocolEntryValue,
} from './long-free-pyramid/protocol'
import {
  PyramidProtocolEntry,
  type PyramidProtocolEntry as PyramidProtocolEntryValue,
} from './pyramid/protocol'
import type { RegisteredGameKey } from './registry'
import {
  StrilaProtocolEntry,
  type StrilaProtocolEntry as StrilaProtocolEntryValue,
} from './strila-v2/definitions'

export type RegisteredGameProtocolEntry =
  | StrilaProtocolEntryValue
  | LongFreePyramidProtocolEntryValue
  | PyramidProtocolEntryValue

export function parseGameProtocolEntry(
  gameKey: RegisteredGameKey,
  input: GameProtocolEntry,
): RegisteredGameProtocolEntry {
  switch (gameKey) {
    case 'strila-v2':
      return v.parse(StrilaProtocolEntry, input)
    case 'free-pyramid-long':
      return v.parse(LongFreePyramidProtocolEntry, input)
    case 'free-pyramid':
    case 'combined-pyramid':
    case 'combined-pyramid-old':
      return v.parse(PyramidProtocolEntry, input)
  }

  throw new Error('Unsupported registered game')
}

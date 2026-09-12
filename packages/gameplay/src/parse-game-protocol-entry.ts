import type { GameProtocolEntry } from '@ks/core'
import * as v from 'valibot'

import { LongFreePyramidProtocolEntry } from './long-free-pyramid/protocol'
import { PyramidProtocolEntry } from './pyramid/protocol'
import type { RegisteredGameKey } from './registry'
import { StrilaProtocolEntry } from './strila-v2/definitions'

export function parseGameProtocolEntry(
  gameKey: RegisteredGameKey,
  input: GameProtocolEntry,
): GameProtocolEntry {
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

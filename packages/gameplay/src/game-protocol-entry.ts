import * as v from 'valibot'

import { LongFreePyramidProtocolEntry } from './long-free-pyramid/protocol'
import { PyramidProtocolEntry } from './pyramid/protocol'
import { StrilaProtocolEntry } from './strila-v2/definitions'

export const GameProtocolEntry = v.union([
  StrilaProtocolEntry,
  LongFreePyramidProtocolEntry,
  PyramidProtocolEntry,
])

export type GameProtocolEntry = v.InferOutput<typeof GameProtocolEntry>

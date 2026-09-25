import * as v from 'valibot'

import { LongFreePyramidCheckpoint } from './long-free-pyramid/definitions'
import { PyramidCheckpoint } from './pyramid/definitions'
import { StrilaCheckpoint } from './strila-v2/definitions'

/** Correlates the game key with its complete executable frame state. */
export const GameplayCheckpoint = v.variant('gameKey', [
  v.object({ gameKey: v.literal('strila-v2'), state: StrilaCheckpoint }),
  v.object({ gameKey: v.literal('free-pyramid-long'), state: LongFreePyramidCheckpoint }),
  v.object({ gameKey: v.literal('free-pyramid'), state: PyramidCheckpoint }),
  v.object({ gameKey: v.literal('combined-pyramid'), state: PyramidCheckpoint }),
  v.object({ gameKey: v.literal('combined-pyramid-old'), state: PyramidCheckpoint }),
])

export type GameplayCheckpoint = v.InferOutput<typeof GameplayCheckpoint>

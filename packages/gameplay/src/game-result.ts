import * as v from 'valibot'

import { LongFreePyramidResult } from './long-free-pyramid/definitions'

/** Optional game-owned result accompanying a finished Match; other games currently have none. */
export const GameResult = LongFreePyramidResult

export type GameResult = v.InferOutput<typeof GameResult>

import { type BySeatNumber } from '@ks/core'
import * as v from 'valibot'

import { GameScoreboardProjectionSchema } from '../../constants'
import type { LongFreePyramidProjectionDetails } from '../definitions'

export function deriveLongFreePyramidScoreboardView(args: { score: BySeatNumber; details: LongFreePyramidProjectionDetails }) {
  return v.parse(GameScoreboardProjectionSchema, {
    gameKey: 'free-pyramid-long',
    projection: 'scoreboard',
    score: args.score,
    details: args.details,
  })
}

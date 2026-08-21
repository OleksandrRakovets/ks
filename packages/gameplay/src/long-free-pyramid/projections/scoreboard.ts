import { type BySeatNumber } from '@ks/core'

import type { LongFreePyramidProjectionDetails, LongFreePyramidScoreboardView } from '../definitions'

export function deriveLongFreePyramidScoreboardView(args: {
  score: BySeatNumber
  details: LongFreePyramidProjectionDetails
}): LongFreePyramidScoreboardView {
  return {
    gameKey: 'free-pyramid-long',
    projection: 'scoreboard',
    score: args.score,
    details: args.details,
  }
}

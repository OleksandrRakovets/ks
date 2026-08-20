import { type BySeatNumber } from '@ks/core'

import type { LongFreePyramidProjectionDetails, LongFreePyramidSummaryView } from '../definitions'

export function deriveLongFreePyramidSummaryView(args: {
  score: BySeatNumber
  details: LongFreePyramidProjectionDetails
}): LongFreePyramidSummaryView {
  return {
    gameKey: 'free-pyramid-long',
    projection: 'summary',
    score: args.score,
    details: args.details,
  }
}

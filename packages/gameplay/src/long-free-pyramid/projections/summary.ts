import { type BySeatNumber } from '@ks/core'
import * as v from 'valibot'

import { GameSummaryProjectionSchema } from '../../constants'
import type { LongFreePyramidProjectionDetails } from '../definitions'

export function deriveLongFreePyramidSummaryView(args: { score: BySeatNumber; details: LongFreePyramidProjectionDetails }) {
  return v.parse(GameSummaryProjectionSchema, {
    gameKey: 'free-pyramid-long',
    projection: 'summary',
    score: args.score,
    details: args.details,
  })
}

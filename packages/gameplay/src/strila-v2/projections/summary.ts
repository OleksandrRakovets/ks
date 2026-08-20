import * as v from 'valibot'

import { type StrilaFrameState, StrilaSummaryViewSchema } from '../definitions'

export function deriveStrilaSummaryView(state: StrilaFrameState) {
  return v.parse(StrilaSummaryViewSchema, {
    gameKey: 'strila-v2',
    projection: 'summary',
    score: state.score,
    details: {
      phase: state.phase,
    },
  })
}

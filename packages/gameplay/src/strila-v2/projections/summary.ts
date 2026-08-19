import * as v from 'valibot'

import { StrilaSummaryViewSchema, type StrilaFrameState } from '../definitions'

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

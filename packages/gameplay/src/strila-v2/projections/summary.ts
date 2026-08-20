import { type StrilaFrameState, type StrilaSummaryView } from '../definitions'

export function deriveStrilaSummaryView(state: StrilaFrameState): StrilaSummaryView {
  return {
    gameKey: 'strila-v2',
    projection: 'summary',
    score: state.score,
    details: {
      phase: state.phase,
    },
  }
}

import type { AnyPyramidSummaryView, PyramidFrameState, PyramidSummaryViewFor } from '../definitions'
import type { PyramidGameKey, PyramidRules } from '../rules'

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

export function derivePyramidSummaryView<K extends PyramidGameKey>(
  state: PyramidFrameState,
  rules: PyramidRules<K>,
): PyramidSummaryViewFor<K> {
  const projection = {
    gameKey: rules.gameKey,
    projection: 'summary',
    score: state.pointsBySeat,
    details: pyramidDetails(state),
  } satisfies AnyPyramidSummaryView & { gameKey: K }
  return projection
}

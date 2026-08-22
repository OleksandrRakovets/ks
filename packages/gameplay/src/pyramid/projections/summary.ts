import type { AnyPyramidSummaryView, PyramidFrameState, PyramidSummaryViewFor } from '../definitions'
import type { PyramidGameKey, PyramidRulesFor } from '../rules'

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winner ?? undefined,
  }
}

export function derivePyramidSummaryView<K extends PyramidGameKey>(
  state: PyramidFrameState,
  rules: PyramidRulesFor<K>,
): PyramidSummaryViewFor<K> {
  const projection = {
    gameKey: rules.gameKey,
    projection: 'summary',
    score: state.pointsBySeat,
    details: pyramidDetails(state),
  } satisfies AnyPyramidSummaryView & { gameKey: K }
  return projection
}

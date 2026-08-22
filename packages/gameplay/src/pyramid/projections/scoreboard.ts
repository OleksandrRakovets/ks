import type { AnyPyramidScoreboardView, PyramidFrameState, PyramidScoreboardViewFor } from '../definitions'
import type { PyramidGameKey, PyramidRules } from '../rules'

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

export function derivePyramidScoreboardView<K extends PyramidGameKey>(
  state: PyramidFrameState,
  rules: PyramidRules<K>,
): PyramidScoreboardViewFor<K> {
  const projection = {
    gameKey: rules.gameKey,
    projection: 'scoreboard',
    score: state.pointsBySeat,
    details: pyramidDetails(state),
  } satisfies AnyPyramidScoreboardView & { gameKey: K }
  return projection
}

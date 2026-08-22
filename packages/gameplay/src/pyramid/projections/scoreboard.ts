import type { AnyPyramidScoreboardView, PyramidFrameState, PyramidScoreboardViewFor } from '../definitions'
import type { PyramidGameKey, PyramidRulesFor } from '../rules'

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winner ?? undefined,
  }
}

export function derivePyramidScoreboardView<K extends PyramidGameKey>(
  state: PyramidFrameState,
  rules: PyramidRulesFor<K>,
): PyramidScoreboardViewFor<K> {
  const projection = {
    gameKey: rules.gameKey,
    projection: 'scoreboard',
    score: state.pointsBySeat,
    details: pyramidDetails(state),
  } satisfies AnyPyramidScoreboardView & { gameKey: K }
  return projection
}

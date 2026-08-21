import type {
  AnyPyramidScoreboardView,
  PyramidFrameState,
  PyramidGameKey,
  PyramidRuntimeConfig,
  PyramidScoreboardViewFor,
} from '../definitions'

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

export function derivePyramidScoreboardView<K extends PyramidGameKey>(
  state: PyramidFrameState,
  config: PyramidRuntimeConfig<K>,
): PyramidScoreboardViewFor<K> {
  const projection = {
    gameKey: config.gameKey,
    projection: 'scoreboard',
    score: state.pointsBySeat,
    details: pyramidDetails(state),
  } satisfies AnyPyramidScoreboardView & { gameKey: K }
  return projection
}

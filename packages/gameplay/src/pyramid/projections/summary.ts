import type {
  AnyPyramidSummaryView,
  PyramidFrameState,
  PyramidGameKey,
  PyramidRuntimeConfig,
  PyramidSummaryViewFor,
} from '../definitions'

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

export function derivePyramidSummaryView<K extends PyramidGameKey>(
  state: PyramidFrameState,
  config: PyramidRuntimeConfig<K>,
): PyramidSummaryViewFor<K> {
  const projection = {
    gameKey: config.gameKey,
    projection: 'summary',
    score: state.pointsBySeat,
    details: pyramidDetails(state),
  } satisfies AnyPyramidSummaryView & { gameKey: K }
  return projection
}

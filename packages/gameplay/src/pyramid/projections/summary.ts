import * as v from 'valibot'

import { GameSummaryProjectionSchema } from '../../constants'
import type { PyramidFrameState, PyramidRuntimeConfig } from '../definitions'

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

export function derivePyramidSummaryView(state: PyramidFrameState, config: PyramidRuntimeConfig) {
  return v.parse(GameSummaryProjectionSchema, {
    gameKey: config.gameKey,
    projection: 'summary',
    score: state.pointsBySeat,
    details: pyramidDetails(state),
  })
}

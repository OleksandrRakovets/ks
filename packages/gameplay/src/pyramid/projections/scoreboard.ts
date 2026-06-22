import * as v from 'valibot'

import { GameScoreboardProjectionSchema } from '../../constants'
import type { PyramidFrameState, PyramidRuntimeConfig } from '../definitions'

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

export function derivePyramidScoreboardView(state: PyramidFrameState, config: PyramidRuntimeConfig) {
  return v.parse(GameScoreboardProjectionSchema, {
    gameKey: config.gameKey,
    projection: 'scoreboard',
    score: state.pointsBySeat,
    details: pyramidDetails(state),
  })
}

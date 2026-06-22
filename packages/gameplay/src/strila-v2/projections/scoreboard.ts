import * as v from 'valibot'

import { StrilaScoreboardViewSchema, type StrilaFrameState, type StrilaScoreboardView } from '../definitions'
import { computeStrilaObjectBalls, computeStrilaPointsAvailable } from './computeds'

export function deriveStrilaScoreboardView(state: StrilaFrameState): StrilaScoreboardView {
  return v.parse(StrilaScoreboardViewSchema, {
    gameKey: 'strila-v2',
    projection: 'scoreboard',
    score: state.score,
    details: {
      objectBalls: computeStrilaObjectBalls(state.coloredBallsOnTable),
      ballsRemaining: state.coloredBallsOnTable,
      pointsAvailable: computeStrilaPointsAvailable(state.coloredBallsOnTable),
      phase: state.phase,
      winner: state.winner ?? undefined,
    },
  })
}

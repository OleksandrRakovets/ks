import { StrilaScoreboardViewSchema, type StrilaFrameState, type StrilaScoreboardView } from '../definitions'
import { computeStrilaObjectBalls, computeStrilaPointsAvailable } from './computeds'

export function deriveStrilaScoreboardView(state: StrilaFrameState): StrilaScoreboardView {
  const winner = state.phase.type === 'winner-determined' || state.phase.type === 'frame-over' ? state.phase.winner : undefined

  return StrilaScoreboardViewSchema.parse({
    gameKey: 'strila-v2',
    projection: 'scoreboard',
    score: state.score,
    details: {
      objectBalls: computeStrilaObjectBalls(state.coloredBallsOnTable),
      ballsRemaining: state.coloredBallsOnTable,
      pointsAvailable: computeStrilaPointsAvailable(state.coloredBallsOnTable),
      phase: state.phase.type,
      winner,
    },
  })
}

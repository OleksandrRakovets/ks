import type { StrilaColoredBall } from '../definitions'

export function computeStrilaPointsAvailable(coloredBallsOnTable: readonly StrilaColoredBall[]): number {
  if (coloredBallsOnTable.length <= 1) return 2
  return coloredBallsOnTable.length * 2
}

export function computeStrilaObjectBalls(coloredBallsOnTable: readonly StrilaColoredBall[]): StrilaColoredBall[] {
  if (coloredBallsOnTable.length <= 1) return [...coloredBallsOnTable]
  if (coloredBallsOnTable.length === 2) return coloredBallsOnTable.slice(0, 1)
  return coloredBallsOnTable.slice(0, 2)
}

import type { StrilaColoredBall } from '../definitions'

type StrilaColoredBall = typeof StrilaColoredBall.Type

export function computeStrilaObjectBalls(
  coloredBallsOnTable: readonly StrilaColoredBall[],
): StrilaColoredBall[] {
  if (coloredBallsOnTable.length <= 1) return [...coloredBallsOnTable]

  if (coloredBallsOnTable.length === 2) return coloredBallsOnTable.slice(0, 1)

  return coloredBallsOnTable.slice(0, 2)
}

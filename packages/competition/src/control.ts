import type { MatchSnapshot } from '@ks/core'

export type MatchControlDecisions = {
  canScore: boolean
  canAwardBySeat: { A: boolean; B: boolean }
  isMatchTargetReached: boolean
  canStartNextFrame: boolean
  canEndMatch: boolean
}

export function deriveMatchControlDecisions(snapshot: MatchSnapshot): MatchControlDecisions {
  const currentFrame = snapshot.frames[snapshot.frames.length - 1]
  const winnerSeat = currentFrame?.winnerSeat
  const isActive = snapshot.status === 'active'
  const frameOpen = isActive && !winnerSeat

  const pointsA = currentFrame?.pointsBySeat.A ?? 0
  const pointsB = currentFrame?.pointsBySeat.B ?? 0
  const targetA = snapshot.targets.frameTargetPointsBySeat.A
  const targetB = snapshot.targets.frameTargetPointsBySeat.B

  const canAwardBySeat = {
    A: frameOpen && pointsA >= targetA,
    B: frameOpen && pointsB >= targetB,
  }

  const framesWonA = snapshot.framesWonBySeat.A
  const framesWonB = snapshot.framesWonBySeat.B
  const targetFrames = snapshot.targets.matchTargetFrames
  const isMatchTargetReached = framesWonA >= targetFrames || framesWonB >= targetFrames

  return {
    canScore: frameOpen,
    canAwardBySeat,
    isMatchTargetReached,
    canStartNextFrame: isActive && Boolean(winnerSeat) && !isMatchTargetReached,
    canEndMatch: isActive && Boolean(winnerSeat) && isMatchTargetReached,
  }
}

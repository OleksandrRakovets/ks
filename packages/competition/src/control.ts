import type { MatchSnapshot } from '@ks/core'

export type MatchLifecycleDecisions = {
  isMatchTargetReached: boolean
  canStartNextFrame: boolean
  canEndMatch: boolean
}

export function deriveMatchLifecycleDecisions(snapshot: MatchSnapshot): MatchLifecycleDecisions {
  const currentFrame = snapshot.frames[snapshot.frames.length - 1]
  const winnerSeat = currentFrame?.winnerSeat
  const isActive = snapshot.status === 'active'

  const framesWonA = snapshot.framesWonBySeat.A
  const framesWonB = snapshot.framesWonBySeat.B
  const targetFrames = snapshot.targets.matchTargetFrames
  const isMatchTargetReached = framesWonA >= targetFrames || framesWonB >= targetFrames

  return {
    isMatchTargetReached,
    canStartNextFrame: isActive && Boolean(winnerSeat) && !isMatchTargetReached,
    canEndMatch: isActive && Boolean(winnerSeat) && isMatchTargetReached,
  }
}

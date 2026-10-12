import type { MatchListEntry } from '@ks/application'
import type { BySeatNumber } from '@ks/core'

export type MatchCardPresentation = {
  readonly score: BySeatNumber
  /** Current Frame points beside the frame score while the Match is active. */
  readonly activeFrameScore: BySeatNumber | null
  readonly playerTargets: BySeatNumber | null
  /** Frame wins needed; cards leave out the noun to fit their meta line. */
  readonly raceToWins: number | null
  readonly frameIndex: number | null
}

/**
 * Long pyramid is one Frame to a point target, so its card shows points against per-player targets.
 * Every other game races to Frame wins, whatever the number of Frames.
 */
export function presentMatchCard(
  match: Pick<MatchListEntry, 'gameKey' | 'status' | 'score' | 'hasCustomFrameTarget'>,
): MatchCardPresentation {
  const { score } = match

  if (match.gameKey === 'free-pyramid-long')
    return {
      score: score.singleFramePointsBySeat ?? { A: 0, B: 0 },
      activeFrameScore: null,
      playerTargets: score.frameTargetPointsBySeat,
      raceToWins: null,
      frameIndex: null,
    }

  const activeFrame = match.status === 'active' ? score.activeFrame : null

  return {
    score: score.framesWonBySeat,
    activeFrameScore: activeFrame?.pointsBySeat ?? null,
    playerTargets: match.hasCustomFrameTarget ? score.frameTargetPointsBySeat : null,
    raceToWins:
      match.status === 'active' || (match.hasCustomFrameTarget && score.matchTargetFrames > 1)
        ? score.matchTargetFrames
        : null,
    frameIndex: activeFrame?.frameIndex ?? null,
  }
}

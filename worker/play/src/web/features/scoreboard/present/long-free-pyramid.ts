import { NO_TIPS, pointDigits, type ScoreboardPresenter } from '@/features/scoreboard/present/shared'

/**
 * Long pyramid is a single frame to points: its points are the match score. Equal targets show
 * alone in the centre, even the default; lopsided targets go under the points around a separator,
 * which spans both rows and leaves no room for a label.
 */
export const longFreePyramid: ScoreboardPresenter = {
  size: (gameKey) => {
    const digits = pointDigits(gameKey)

    // The centre holds at most the target, as wide as the points.
    return { ballRow: false, pointChars: digits, centre: { kind: 'target', digits } }
  },
  present: (read) => {
    const targets = read.targets.frameTargetPointsBySeat

    return targets.A === targets.B
      ? { targets: null, centre: { kind: 'target', target: targets.A }, balls: null, tips: NO_TIPS }
      : { targets: { ...targets, label: null }, centre: { kind: 'separator' }, balls: null, tips: NO_TIPS }
  },
}

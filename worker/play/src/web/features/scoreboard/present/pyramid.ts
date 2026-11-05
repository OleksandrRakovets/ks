import {
  FRAMES_CENTRE_SIZE,
  framesCentre,
  handicapTargets,
  NO_TIPS,
  pointDigits,
  type ScoreboardPresenter,
} from '@/features/scoreboard/present/shared'

/** Free, combined, and old-rules combined pyramid: a frame race with no ball row or tips. */
export const pyramid: ScoreboardPresenter = {
  size: (gameKey) => ({
    ballRow: false,
    // Old-rules fouls can take a player below zero, so its points boxes also fit a minus sign.
    pointChars: pointDigits(gameKey) + (gameKey === 'combined-pyramid-old' ? 1 : 0),
    centre: FRAMES_CENTRE_SIZE,
  }),
  present: (read, t) => ({
    targets: handicapTargets(read, t),
    centre: framesCentre(read),
    balls: null,
    tips: NO_TIPS,
  }),
}

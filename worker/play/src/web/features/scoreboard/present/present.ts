import type { ReadMatchResult } from '@ks/application'
import type { MatchId, Seat } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import type { TFunction } from 'i18next'

import { longFreePyramid } from '@/features/scoreboard/present/long-free-pyramid'
import { pyramid } from '@/features/scoreboard/present/pyramid'
import type { ScoreboardPresenter } from '@/features/scoreboard/present/shared'
import { strilaV2 } from '@/features/scoreboard/present/strila-v2'
import type { ScoreboardNames, ScoreboardSize, ScoreboardValues } from '@/features/scoreboard/values'

/**
 * Projects a match read into scoreboard values. A missing or discarded match is empty, not an
 * error: the stream shows nothing until the URL points at a real match.
 */
export function presentScoreboard(
  scoreboard: { gameKey: GameKey; matchId: MatchId; read: ReadMatchResult<GameKey>; names: ScoreboardNames },
  t: TFunction,
): ScoreboardValues {
  const { matchId, read } = scoreboard
  const size = scoreboardSize(scoreboard.gameKey)

  if (!read.ok) return { kind: 'empty', matchId, size }

  const name = (seat: Seat) =>
    scoreboard.names === 'short'
      ? read.participants[seat].shortDisplayName
      : read.participants[seat].displayName

  const points = read.representedFrame?.pointsBySeat ?? { A: 0, B: 0 }

  return {
    kind: 'match',
    matchId,
    size,
    seq: read.latestSeq,
    names: { A: name('A'), B: name('B') },
    winnerSeat: read.winnerSeat,
    points: { A: signed(points.A), B: signed(points.B) },
    ...PRESENTERS[read.gameKey].present(read, t),
  }
}

export function scoreboardSize(gameKey: GameKey): ScoreboardSize {
  return PRESENTERS[gameKey].size(gameKey)
}

/** Each game uses its gameplay machine's presenter. */
const PRESENTERS = {
  'strila-v2': strilaV2,
  'free-pyramid': pyramid,
  'combined-pyramid': pyramid,
  'combined-pyramid-old': pyramid,
  'free-pyramid-long': longFreePyramid,
} satisfies Record<GameKey, ScoreboardPresenter>

/** U+2212 MINUS SIGN, which matches the digits' width and height unlike a hyphen. */
function signed(points: number) {
  return points < 0 ? `\u2212${-points}` : String(points)
}

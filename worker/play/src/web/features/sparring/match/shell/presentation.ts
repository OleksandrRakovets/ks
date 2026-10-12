import type { MatchReadFacts } from '@ks/application'
import { type BySeatNumber, type HydratedMatchParticipants, opponentOf, type Seat } from '@ks/core'
import { type GameKey, type StrilaBall } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

import type { ActiveMatchData, ActiveProtocolData, FinishedSurfaceData } from '@/features/sparring/match/types'

type BoardDetails =
  | { kind: 'balls'; ballsBySeat: { A: readonly StrilaBall[]; B: readonly StrilaBall[] } }
  | { kind: 'rack'; scoreBySeat: BySeatNumber; tableLabel: string }

export type BoardPresentation = {
  names: { A: string; B: string }
  score: ReturnType<typeof presentBoardScore>
  mutedSeat: Seat | null
  framesLabel: string
  label?: string
  winnerLabel?: string
  /** Centered under the scores, where finished pages identify the game outside the match header. */
  caption?: string
  details: BoardDetails | null
}

export function presentActiveSurface<K extends GameKey>(
  data: ActiveMatchData<K> | ActiveProtocolData<K>,
  t: TFunction,
) {
  const board = presentBoard(data, data.participants, t)
  board.label = t(keys.match.control.perGameContainer)

  if (data.controlPhase === 'frame-active' && data.game.gameKey === 'strila-v2') {
    board.details = { kind: 'balls', ballsBySeat: data.game.details.pottedBallsBySeat }
  }

  if (data.controlPhase === 'frame-active' && data.game.gameKey === 'free-pyramid-long') {
    const details = data.game.details
    board.details = {
      kind: 'rack',
      scoreBySeat: details.currentRack.scoreBySeat,
      tableLabel: t(keys.match.control.longFreePyramid.ballsOnTable, { count: details.ballsOnTable }),
    }

    return {
      header: {
        title: t(keys.match.control.longFreePyramid.rack, { rackNumber: details.currentRack.rackNumber }),
        rule: t(keys.match.control.longFreePyramid.rackRollover, { count: details.rackRollover }),
      },
      board,
    }
  }

  return {
    header: {
      title: t(keys.match.scoreboard.frameWithNumber, {
        frameIndex: Math.max(1, data.representedFrame?.frameIndex ?? 0),
      }),
      rule: t(keys.match.scoreboard.raceToWins, { count: data.targets.matchTargetFrames }),
    },
    board,
  }
}

export function presentFinishedBoard(data: FinishedSurfaceData, t: TFunction): BoardPresentation {
  const board = presentBoard(data, data.participants, t)
  board.winnerLabel = t(keys.match.result.winner, {
    name: data.participants[data.winnerSeat].displayName,
  })
  // Long pyramid shows its point targets beside the scores instead of a frame race.
  board.caption =
    data.gameKey === 'free-pyramid-long'
      ? data.gameTitle
      : `${data.gameTitle} · ${t(keys.match.scoreboard.raceToWins, { count: data.targets.matchTargetFrames })}`

  return board
}

/**
 * Finished frame-based matches prioritize frame wins; active matches and long pyramid prioritize points.
 * @internal Exported for board-score contract tests.
 */
export function presentBoardScore(data: MatchReadFacts) {
  const frameWinsArePrimary = data.lifecycle === 'finished' && data.gameKey !== 'free-pyramid-long'

  const primary = frameWinsArePrimary
    ? data.framesWonBySeat
    : (data.representedFrame?.pointsBySeat ?? { A: 0, B: 0 })

  const configuredTargets = data.targets.frameTargetPointsBySeat

  const targets = {
    A: frameWinsArePrimary ? undefined : configuredTargets.A,
    B: frameWinsArePrimary ? undefined : configuredTargets.B,
  }

  return {
    primary,
    targets,
    framesWon: !frameWinsArePrimary && data.targets.matchTargetFrames > 1 ? data.framesWonBySeat : undefined,
    winnerSeat: data.winnerSeat,
    compactScore: Math.max(primary.A, primary.B, targets.A ?? 0, targets.B ?? 0) >= 100,
  }
}

function presentBoard(
  data: MatchReadFacts,
  participants: HydratedMatchParticipants,
  t: TFunction,
): BoardPresentation {
  return {
    names: { A: participants.A.displayName, B: participants.B.displayName },
    score: presentBoardScore(data),
    mutedSeat: data.winnerSeat === null ? null : opponentOf(data.winnerSeat),
    framesLabel: t(keys.match.control.frames),
    details: null,
  }
}

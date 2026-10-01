import type { MatchState } from '@ks/competition'
import { type BySeatNumber, type HydratedMatchParticipants, opponentOf, type Seat } from '@ks/core'
import { type GameKey, type StrilaBall } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

import type { ActiveMatchData, ActiveProtocolData, FinishedMatchData } from '../types'

export type BoardDetails =
  | { kind: 'balls'; ballsBySeat: { A: readonly StrilaBall[]; B: readonly StrilaBall[] } }
  | { kind: 'rack'; scoreBySeat: BySeatNumber; tableLabel: string }

export type BoardPresentation = {
  names: { A: string; B: string }
  score: ReturnType<typeof presentBoardScore>
  mutedSeat: Seat | null
  framesLabel: string
  label?: string
  winnerLabel?: string
  details: BoardDetails | null
}

export function presentActiveSurface<K extends GameKey>(
  data: ActiveMatchData<K> | ActiveProtocolData<K>,
  t: TFunction,
) {
  const board = presentBoard(data.state, data.participants, t)
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
        frameIndex: Math.max(1, data.state.currentFrameIndex),
      }),
      rule: t(keys.match.scoreboard.raceToWins, { targetFrames: data.state.targets.matchTargetFrames }),
    },
    board,
  }
}

export function presentFinishedSurface(data: FinishedMatchData, t: TFunction) {
  const board = presentBoard(data.state, data.participants, t)
  board.winnerLabel = t(keys.match.result.winner, {
    name: data.participants[data.state.winnerSeat].displayName,
  })

  return {
    header: {
      title: data.shortGameTitle,
      rule:
        data.state.gameKey === 'free-pyramid-long'
          ? ''
          : t(keys.match.scoreboard.target, { target: data.state.targets.matchTargetFrames }),
    },
    board,
  }
}

/** Finished frame-based matches prioritize frame wins; active matches and long pyramid prioritize points. */
export function presentBoardScore(state: MatchState) {
  const frameWinsArePrimary = state.status === 'finished' && state.gameKey !== 'free-pyramid-long'

  const primary = frameWinsArePrimary
    ? state.framesWonBySeat
    : state.currentFrameIndex > 0
      ? state.frames[state.currentFrameIndex - 1].pointsBySeat
      : { A: 0, B: 0 }

  const configuredTargets = state.targets.frameTargetPointsBySeat

  const targets = {
    A: frameWinsArePrimary ? undefined : configuredTargets.A,
    B: frameWinsArePrimary ? undefined : configuredTargets.B,
  }

  return {
    primary,
    targets,
    framesWon: !frameWinsArePrimary && state.targets.matchTargetFrames > 1 ? state.framesWonBySeat : undefined,
    winnerSeat: state.winnerSeat,
    compactScore: Math.max(primary.A, primary.B, targets.A ?? 0, targets.B ?? 0) >= 100,
  }
}

function presentBoard(
  state: MatchState,
  participants: HydratedMatchParticipants,
  t: TFunction,
): BoardPresentation {
  return {
    names: { A: participants.A.displayName, B: participants.B.displayName },
    score: presentBoardScore(state),
    mutedSeat: state.winnerSeat === null ? null : opponentOf(state.winnerSeat),
    framesLabel: t(keys.match.control.frames),
    details: null,
  }
}

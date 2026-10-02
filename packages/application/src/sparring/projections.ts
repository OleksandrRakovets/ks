import type { MatchScoreProjection } from '@ks/competition'
import type { MatchStateFor } from '@ks/competition/definitions'
import type { HydratedMatchParticipants, InstantPresentation, UnixEpochMilliseconds } from '@ks/core'
import { type GameKey, type GameResult, registry } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import type { MatchRoomClient } from '../match/match-room'
import { presentParticipant } from '../player/participant'
import type { MatchListEntry, MatchReadFacts, ReadMatchResult, ResultScores } from './contract'
import type { MatchListRecord } from './storage/records'

export function presentListEntry(
  record: MatchListRecord,
  score: Pick<MatchListEntry, 'latestSeq' | 'score'> &
    ({ status: 'active'; endedAt: null } | { status: 'finished'; endedAt: typeof UnixEpochMilliseconds.Type }),
  locale: SupportedLocale,
  formattedCreatedAt: InstantPresentation,
  formattedNow: InstantPresentation,
  createdAtLabel: string,
): MatchListEntry {
  return {
    matchId: record.matchId,
    gameKey: record.gameKey,
    shortGameTitle: registry[record.gameKey].meta.shortGameTitle[locale],
    createdAtIso: formattedCreatedAt.isoString,
    createdAtLabel,
    createdAtDate: formattedCreatedAt.date,
    createdAtIsToday: isSameLocalDate(formattedCreatedAt, formattedNow),
    participants: {
      A: presentParticipant(record.participants.A, locale),
      B: presentParticipant(record.participants.B, locale),
    },
    ...score,
    hasCustomFrameTarget: hasCustomFrameTarget(record.gameKey, score.score.frameTargetPointsBySeat),
  }
}

export function presentFinishedMatch<K extends typeof GameKey.Type>(
  match: Pick<
    Extract<Awaited<ReturnType<MatchRoomClient['getControls']>>, { _tag: 'finalizing' }>,
    'state' | 'gameResult' | 'latestSeq' | 'endedAt'
  > & { state: MatchStateFor<K> & { status: 'finished' } },
  participants: typeof HydratedMatchParticipants.Type,
  endedAt: InstantPresentation,
  now: InstantPresentation,
): Extract<ReadMatchResult<K>, { lifecycle: 'finished' }> {
  const finished: Extract<ReadMatchResult<K>, { lifecycle: 'finished' }> = {
    ...projectMatchFacts(match.state, match.latestSeq, participants),
    lifecycle: 'finished',
    winnerSeat: match.state.winnerSeat,
    resultScores: projectResultScores(match.state, match.gameResult),
    endedAtIso: endedAt.isoString,
    endedAtTime: endedAt.time,
    endedAtDate: endedAt.date,
    endedAtIsToday: isSameLocalDate(endedAt, now),
  }

  return match.state.gameConfiguration === undefined
    ? finished
    : { ...finished, gameConfiguration: match.state.gameConfiguration }
}

export function projectMatchFacts<K extends typeof GameKey.Type>(
  state: MatchStateFor<K>,
  latestSeq: number,
  participants: typeof HydratedMatchParticipants.Type,
): Omit<MatchReadFacts<K>, 'lifecycle' | 'winnerSeat'> {
  let representedFrame: MatchReadFacts<K>['representedFrame'] = null

  if (state.currentFrameIndex !== 0) {
    const frame = state.frames.find((frame) => frame.frameIndex === state.currentFrameIndex)

    if (frame === undefined) throw new Error('Missing represented Match frame')
    representedFrame = { frameIndex: frame.frameIndex, pointsBySeat: frame.pointsBySeat }
  }

  return {
    matchId: state.matchId,
    gameKey: state.gameKey,
    latestSeq,
    participants,
    targets: state.targets,
    framesWonBySeat: state.framesWonBySeat,
    representedFrame,
  }
}

export function matchCreatedAtLabel(
  formattedCreatedAt: InstantPresentation,
  formattedNow: InstantPresentation,
): string {
  if (isSameLocalDate(formattedCreatedAt, formattedNow)) return formattedCreatedAt.time

  const date = `${formattedCreatedAt.date.day}.${formattedCreatedAt.date.month}`

  return formattedCreatedAt.date.year === formattedNow.date.year
    ? date
    : `${date}.${formattedCreatedAt.date.year}`
}

function projectResultScores(
  state: MatchStateFor<typeof GameKey.Type>,
  gameResult: typeof GameResult.Type | null,
): ResultScores {
  return gameResult?.gameKey === 'free-pyramid-long'
    ? {
        kind: 'racks',
        rows: gameResult.racks.map((rack) => ({ index: rack.rackNumber, score: rack.scoreBySeat })),
      }
    : {
        kind: 'frames',
        rows: state.frames.map((frame) => ({ index: frame.frameIndex, score: frame.pointsBySeat })),
      }
}

function isSameLocalDate(left: InstantPresentation, right: InstantPresentation): boolean {
  return (
    left.date.year === right.date.year &&
    left.date.month === right.date.month &&
    left.date.day === right.date.day
  )
}

function hasCustomFrameTarget(
  gameKey: typeof GameKey.Type,
  target: (typeof MatchScoreProjection.Type)['frameTargetPointsBySeat'],
): boolean {
  const defaults = registry[gameKey].meta.defaultFrameTargetPointsBySeat

  return target.A !== defaults.A || target.B !== defaults.B
}

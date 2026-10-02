import type { MatchScoreProjection } from '@ks/competition'
import type { MatchStateFor } from '@ks/competition/definitions'
import type { HydratedMatchParticipants, InstantPresentation, UnixEpochMilliseconds } from '@ks/core'
import { type GameKey, registry } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import type { MatchRoomClient } from '../match/match-room'
import { presentParticipant } from '../player/participant'
import type { MatchListEntry, ReadMatchResult } from './contract'
import type { MatchListRecord } from './storage/records'

export function presentListEntry(
  record: MatchListRecord,
  score: Pick<MatchListEntry, 'latestSeq' | 'score'> &
    ({ status: 'active'; endedAt: null } | { status: 'finished'; endedAt: UnixEpochMilliseconds }),
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

export function presentFinishedMatch<K extends GameKey>(
  match: Pick<
    Extract<Awaited<ReturnType<MatchRoomClient['getControls']>>, { _tag: 'finalizing' }>,
    'state' | 'gameResult' | 'latestSeq' | 'endedAt'
  > & { state: MatchStateFor<K> & { status: 'finished' } },
  participants: HydratedMatchParticipants,
  endedAt: InstantPresentation,
  now: InstantPresentation,
): Extract<ReadMatchResult<K>, { ok: true; lifecycle: 'finished' }> {
  return {
    ok: true,
    lifecycle: 'finished',
    state: match.state,
    gameResult: match.gameResult,
    latestSeq: match.latestSeq,
    endedAtIso: endedAt.isoString,
    endedAtTime: endedAt.time,
    endedAtDate: endedAt.date,
    endedAtIsToday: isSameLocalDate(endedAt, now),
    participants,
    hasCustomFrameTarget: hasCustomFrameTarget(
      match.state.gameKey,
      match.state.targets.frameTargetPointsBySeat,
    ),
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

function isSameLocalDate(left: InstantPresentation, right: InstantPresentation): boolean {
  return (
    left.date.year === right.date.year &&
    left.date.month === right.date.month &&
    left.date.day === right.date.day
  )
}

function hasCustomFrameTarget(
  gameKey: GameKey,
  target: MatchScoreProjection['frameTargetPointsBySeat'],
): boolean {
  const defaults = registry[gameKey].meta.defaultFrameTargetPointsBySeat

  return target.A !== defaults.A || target.B !== defaults.B
}

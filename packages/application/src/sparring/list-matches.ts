import type { InstantPresentation, MatchId } from '@ks/core'
import { UnixEpochMilliseconds } from '@ks/core'
import type { SupportedLocale } from '@ks/i18n'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Effect } from 'effect'
import * as v from 'valibot'

import { ApplicationClock } from '../match/clock'
import { MatchRooms } from '../match/match-room'
import type {
  FinishedMatchListPage,
  LiveMatchListPage,
  MatchListDay,
  MatchScorePollEntry,
  ReadMatchScoresResult,
} from './contract'
import { matchCreatedAtLabel, presentListEntry } from './projections'
import type { MatchListRecord, MatchRecord } from './storage/records'
import { SparringMatchStorage } from './storage/sparring-match-storage'

const RECENT_FINISHED_MATCH_WINDOW_MS = 15 * 60 * 1_000

export const listLiveMatches = Effect.fn('listLiveMatches')(function* (
  locale: SupportedLocale,
): Effect.fn.Return<
  LiveMatchListPage,
  EffectDrizzleQueryError,
  ApplicationClock | MatchRooms | SparringMatchStorage
> {
  const clock = yield* ApplicationClock
  const matchesStorage = yield* SparringMatchStorage
  const now = clock.nowMs()
  const formattedNow = clock.instantPresentation(now)

  const records = yield* matchesStorage.listLive(
    v.parse(UnixEpochMilliseconds, Math.max(0, now - RECENT_FINISHED_MATCH_WINDOW_MS)),
  )

  const matches = yield* projectListEntries(records, locale, formattedNow, (formattedCreatedAt) =>
    matchCreatedAtLabel(formattedCreatedAt, formattedNow),
  )

  const earliestRecentFinishedMatchExpiry = matches.reduce<number | undefined>((earliest, match) => {
    if (match.status !== 'finished') return earliest
    const expiresAt = match.endedAt + RECENT_FINISHED_MATCH_WINDOW_MS

    return earliest === undefined ? expiresAt : Math.min(earliest, expiresAt)
  }, undefined)

  return earliestRecentFinishedMatchExpiry === undefined
    ? { scope: 'live', matches }
    : {
        scope: 'live',
        matches,
        recentFinishedMatchExpiresAfterMs: Math.max(0, earliestRecentFinishedMatchExpiry - now),
      }
})

export const listFinishedMatches = Effect.fn('listFinishedMatches')(function* (
  locale: SupportedLocale,
  requestedDay?: typeof MatchListDay.Type,
): Effect.fn.Return<
  FinishedMatchListPage,
  EffectDrizzleQueryError,
  ApplicationClock | MatchRooms | SparringMatchStorage
> {
  const clock = yield* ApplicationClock
  const matchesStorage = yield* SparringMatchStorage
  const now = clock.nowMs()
  const formattedNow = clock.instantPresentation(now)

  const latest =
    requestedDay === undefined
      ? yield* matchesStorage.findFinishedTime({
          before: v.parse(UnixEpochMilliseconds, Number.MAX_SAFE_INTEGER),
        })
      : null

  const day = requestedDay ?? (latest === null ? null : localDay(clock, latest))

  if (day === null)
    return { scope: 'finished', matches: [], day: null, previousDay: null, nextDay: null, isToday: false }

  const range = clock.dayRange(day)
  const records = yield* matchesStorage.listFinished(range)

  const matches = yield* projectListEntries(
    records,
    locale,
    formattedNow,
    (formattedCreatedAt) => formattedCreatedAt.time,
  )

  const [previous, next] = yield* Effect.all(
    [
      matchesStorage.findFinishedTime({ before: range.start }),
      matchesStorage.findFinishedTime({ from: range.end }),
    ],
    { concurrency: 'unbounded' },
  )

  return {
    scope: 'finished',
    matches,
    day,
    previousDay: previous === null ? null : localDay(clock, previous),
    nextDay: next === null ? null : localDay(clock, next),
    isToday: day === localDay(clock, now),
  }
})

export const readMatchScores = Effect.fn('readMatchScores')(function* (
  matchIds: readonly MatchId[],
): Effect.fn.Return<ReadMatchScoresResult, EffectDrizzleQueryError, MatchRooms | SparringMatchStorage> {
  if (matchIds.length < 1 || new Set(matchIds).size !== matchIds.length)
    throw new Error('Match score batch must contain unique Matches')

  const matchesStorage = yield* SparringMatchStorage

  const recordsById = new Map(
    (yield* matchesStorage.listMatches(matchIds)).map((record) => [record.matchId, record]),
  )

  const records: MatchRecord[] = []

  for (const matchId of matchIds) {
    const record = recordsById.get(matchId)

    if (!record) return { ok: false, reason: 'unknown-match' }

    if (record.status === 'creating')
      throw new Error('Creating Match cannot be included in Match score polling')
    records.push(record)
  }

  const matches: MatchScorePollEntry[] = yield* Effect.forEach(
    records,
    Effect.fnUntraced(function* (record) {
      return {
        matchId: record.matchId,
        ...(yield* readMatchScoreForList(record)),
      }
    }),
    { concurrency: 'unbounded' },
  )

  return { ok: true, matches }
})

const projectListEntries = Effect.fnUntraced(function* (
  records: readonly MatchListRecord[],
  locale: SupportedLocale,
  formattedNow: InstantPresentation,
  label: (formattedCreatedAt: InstantPresentation) => string,
) {
  const clock = yield* ApplicationClock

  return yield* Effect.forEach(
    records,
    Effect.fnUntraced(function* (record) {
      const score = yield* readMatchScoreForList(record)
      const formattedCreatedAt = clock.instantPresentation(record.createdAt)

      return presentListEntry(
        record,
        score,
        locale,
        formattedCreatedAt,
        formattedNow,
        label(formattedCreatedAt),
      )
    }),
    { concurrency: 'unbounded' },
  )
})

function localDay(
  clock: ApplicationClock['Service'],
  instant: UnixEpochMilliseconds,
): typeof MatchListDay.Type {
  const { year, month, day } = clock.instantPresentation(instant).date

  return `${year}-${month}-${day}`
}

const readMatchScoreForList = Effect.fnUntraced(function* (
  record: MatchRecord,
): Effect.fn.Return<Parameters<typeof presentListEntry>[1], never, MatchRooms> {
  if (record.status === 'finished')
    return {
      status: 'finished',
      endedAt: record.endedAt,
      latestSeq: record.finalSourceLatestSeq,
      score: record.finalScore,
    }

  if (record.status === 'creating') throw new Error('Creating Match cannot be included in the Match list')
  const rooms = yield* MatchRooms
  const room = yield* rooms.get(record.matchId).getScore()

  if (room._tag === 'active')
    return { status: 'active', endedAt: null, latestSeq: room.latestSeq, score: room.score }

  return { status: 'finished', endedAt: room.endedAt, latestSeq: room.latestSeq, score: room.score }
})

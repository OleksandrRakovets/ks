import type { InstantPresentation, MatchId } from '@ks/core'
import { UnixEpochMilliseconds } from '@ks/core'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type {
  FinishedMatchListPage,
  LiveMatchListPage,
  MatchListDay,
  MatchListEntry,
  MatchScorePollEntry,
  ReadMatchScoresResult,
} from './contract'
import { matchCreatedAtLabel, presentListEntry } from './projections'
import type { SparringDependencies } from './sparring-application'
import type { MatchListRecord, MatchRecord } from './storage/records'

const RECENT_FINISHED_MATCH_WINDOW_MS = 15 * 60 * 1_000

export async function listLiveMatches(
  deps: SparringDependencies,
  locale: SupportedLocale,
): Promise<LiveMatchListPage> {
  const now = deps.clock.nowMs()
  const formattedNow = deps.clock.instantPresentation(now)

  const records = await deps.matches.listLive(
    v.parse(UnixEpochMilliseconds, Math.max(0, now - RECENT_FINISHED_MATCH_WINDOW_MS)),
  )

  const matches = await projectListEntries(deps, records, locale, formattedNow, (formattedCreatedAt) =>
    matchCreatedAtLabel(formattedCreatedAt, formattedNow),
  )

  return { scope: 'live', matches }
}

export async function listFinishedMatches(
  deps: SparringDependencies,
  locale: SupportedLocale,
  requestedDay?: MatchListDay,
): Promise<FinishedMatchListPage> {
  const now = deps.clock.nowMs()
  const formattedNow = deps.clock.instantPresentation(now)

  const latest =
    requestedDay === undefined
      ? await deps.matches.findFinishedTime({
          before: v.parse(UnixEpochMilliseconds, Number.MAX_SAFE_INTEGER),
        })
      : null

  const day = requestedDay ?? (latest === null ? null : localDay(deps, latest))

  if (day === null)
    return { scope: 'finished', matches: [], day: null, previousDay: null, nextDay: null, isToday: false }

  const range = deps.clock.dayRange(day)
  const records = await deps.matches.listFinished(range)

  const matches = await projectListEntries(
    deps,
    records,
    locale,
    formattedNow,
    (formattedCreatedAt) => formattedCreatedAt.time,
  )

  const [previous, next] = await Promise.all([
    deps.matches.findFinishedTime({ before: range.start }),
    deps.matches.findFinishedTime({ from: range.end }),
  ])

  return {
    scope: 'finished',
    matches,
    day,
    previousDay: previous === null ? null : localDay(deps, previous),
    nextDay: next === null ? null : localDay(deps, next),
    isToday: day === localDay(deps, now),
  }
}

export async function readMatchScores(
  deps: SparringDependencies,
  matchIds: readonly MatchId[],
): Promise<ReadMatchScoresResult> {
  if (matchIds.length < 1 || new Set(matchIds).size !== matchIds.length)
    throw new Error('Match score batch must contain unique Matches')

  const recordsById = new Map(
    (await deps.matches.listMatches(matchIds)).map((record) => [record.matchId, record]),
  )

  const records: MatchRecord[] = []

  for (const matchId of matchIds) {
    const record = recordsById.get(matchId)

    if (!record || record.status === 'discarded') return { ok: false, reason: 'unknown-match' }

    if (record.status === 'creating')
      throw new Error('Creating Match cannot be included in Match score polling')
    records.push(record)
  }

  const scores = await Promise.all(records.map((record) => readMatchScoreForList(deps, record)))
  const matches: MatchScorePollEntry[] = []

  for (const [index, record] of records.entries()) {
    const score = scores[index]

    if (!score) return { ok: false, reason: 'unknown-match' }

    matches.push({ matchId: record.matchId, ...score })
  }

  return { ok: true, matches }
}

async function projectListEntries(
  deps: SparringDependencies,
  records: readonly MatchListRecord[],
  locale: SupportedLocale,
  formattedNow: InstantPresentation,
  label: (formattedCreatedAt: InstantPresentation) => string,
): Promise<MatchListEntry[]> {
  const matches = await Promise.all(
    records.map(async (record) => {
      const score = await readMatchScoreForList(deps, record)

      if (score === null) return null
      const formattedCreatedAt = deps.clock.instantPresentation(record.createdAt)

      return presentListEntry(
        record,
        score,
        locale,
        formattedCreatedAt,
        formattedNow,
        label(formattedCreatedAt),
      )
    }),
  )

  return matches.filter((match) => match !== null)
}

function localDay(deps: SparringDependencies, instant: UnixEpochMilliseconds): MatchListDay {
  const { year, month, day } = deps.clock.instantPresentation(instant).date

  return `${year}-${month}-${day}`
}

async function readMatchScoreForList(
  deps: SparringDependencies,
  record: MatchRecord,
): Promise<Parameters<typeof presentListEntry>[1] | null> {
  if (record.status === 'discarded') return null

  if (record.status === 'finished')
    return {
      status: 'finished',
      endedAt: record.endedAt,
      latestSeq: record.finalSourceLatestSeq,
      score: record.finalScore,
    }

  if (record.status === 'creating') throw new Error('Creating Match cannot be included in the Match list')
  const room = await deps.matchRoomClient(record.matchId).getScore()

  if (room._tag === 'discarded') return null

  if (room._tag === 'active')
    return { status: 'active', endedAt: null, latestSeq: room.latestSeq, score: room.score }

  return { status: 'finished', endedAt: room.endedAt, latestSeq: room.latestSeq, score: room.score }
}

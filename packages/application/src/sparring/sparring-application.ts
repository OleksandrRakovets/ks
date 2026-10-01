import { type CreateMatchRequest, type MatchScoreProjection } from '@ks/competition'
import {
  type Clock,
  type InstantPresentation,
  type MatchCommand,
  type MatchId,
  type NonNegativeInteger,
  UnixEpochMilliseconds,
} from '@ks/core'
import { type GameKey, registry } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import { presentLastCommand } from '../match/last-command-projection'
import type { MatchRoomClient, MatchRoomInitializationInput } from '../match/match-room'
import { renderProtocolRows } from '../match/protocol-projection'
import { presentParticipant, splitGuestDisplayName } from '../player/participant'
import type { PlayerStorage } from '../player/storage/player-storage'
import type {
  CreateSparringMatchResult,
  FinishedMatchListPage,
  LiveMatchListPage,
  MatchListDay,
  MatchListEntry,
  MatchScorePollEntry,
  ReadMatchFailure,
  ReadMatchProtocolResult,
  ReadMatchResult,
  ReadMatchScoresResult,
  SparringApplication,
  SubmitMatchCommandResult,
} from './contract'
import { CreateSparringMatchInput, RECENT_FINISHED_MATCH_WINDOW_MS } from './contract'
import {
  ProtocolArchiveCorruptionError,
  UnsupportedProtocolArchiveVersionError,
} from './storage/protocol-archive'
import type {
  FinishedMatchArchiveRecord,
  MatchListRecord,
  MatchRecord,
  ProtocolArchiveRecord,
} from './storage/records'
import type { SparringMatchStorage } from './storage/sparring-match-storage'

type MatchListScore =
  | {
      readonly status: 'active'
      readonly endedAt: null
      readonly latestSeq: NonNegativeInteger
      readonly score: MatchScoreProjection
    }
  | {
      readonly status: 'finished'
      readonly endedAt: UnixEpochMilliseconds
      readonly latestSeq: NonNegativeInteger
      readonly score: MatchScoreProjection
    }

export type PlayerStore = Pick<PlayerStorage, keyof PlayerStorage>

export type SparringMatchStore = Pick<SparringMatchStorage, keyof SparringMatchStorage>

export type SparringApplicationDependencies = {
  clock: Clock
  newMatchId(): MatchId
  newControlSecret(): string
  players: PlayerStore
  matches: SparringMatchStore
  matchRoomClient(matchId: MatchId): MatchRoomClient
}

export function createSparringApplication(dependencies: SparringApplicationDependencies): SparringApplication {
  return new SparringApplicationService(dependencies)
}

class SparringApplicationService implements SparringApplication {
  readonly #dependencies: SparringApplicationDependencies

  constructor(dependencies: SparringApplicationDependencies) {
    this.#dependencies = dependencies
  }

  async createMatch(input: CreateSparringMatchInput): Promise<CreateSparringMatchResult> {
    const parsed = v.safeParse(CreateSparringMatchInput, input)

    if (!parsed.success) return { ok: false, error: 'Invalid match creation input', status: 400 }
    const matchId = this.#dependencies.newMatchId()
    const controlSecret = this.#dependencies.newControlSecret()
    const createdAt = this.#dependencies.clock.nowMs()
    const { playerNames, ...requestInput } = parsed.output

    const [seatAPlayerRef, seatBPlayerRef] = await Promise.all([
      this.#dependencies.players.ensureGuestRef(splitGuestDisplayName(playerNames.A)),
      this.#dependencies.players.ensureGuestRef(splitGuestDisplayName(playerNames.B)),
    ])

    const participants: CreateMatchRequest['participants'] = [
      { seat: 'A', playerRef: seatAPlayerRef },
      { seat: 'B', playerRef: seatBPlayerRef },
    ]

    const request: MatchRoomInitializationInput = {
      ...requestInput,
      participants,
      matchId,
      controlSecret,
      createdAt,
    }

    await this.#dependencies.matches.beginCreation({
      matchId,
      gameKey: request.gameKey,
      participantRefs: { A: seatAPlayerRef, B: seatBPlayerRef },
      createdAt,
    })
    const result = await this.#dependencies.matchRoomClient(matchId).initialize(request)

    if (result._tag === 'initialization-conflict')
      return { ok: false, error: 'Match already exists', status: 409 }
    await this.#dependencies.matches.activate(matchId)

    return { ok: true, matchId }
  }

  async listLiveMatches(locale: SupportedLocale): Promise<LiveMatchListPage> {
    const now = this.#dependencies.clock.nowMs()
    const formattedNow = this.#dependencies.clock.instantPresentation(now)

    const records = await this.#dependencies.matches.listLive(
      v.parse(UnixEpochMilliseconds, Math.max(0, now - RECENT_FINISHED_MATCH_WINDOW_MS)),
    )

    const matches = await this.#projectListEntries(records, locale, formattedNow, (formattedCreatedAt) =>
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
  }

  async listFinishedMatches(
    locale: SupportedLocale,
    requestedDay?: MatchListDay,
  ): Promise<FinishedMatchListPage> {
    const now = this.#dependencies.clock.nowMs()
    const formattedNow = this.#dependencies.clock.instantPresentation(now)

    const latest =
      requestedDay === undefined
        ? await this.#dependencies.matches.findFinishedTime({
            before: v.parse(UnixEpochMilliseconds, Number.MAX_SAFE_INTEGER),
          })
        : null

    const day = requestedDay ?? (latest === null ? null : this.#localDay(latest))

    if (day === null)
      return { scope: 'finished', matches: [], day: null, previousDay: null, nextDay: null, isToday: false }

    const range = this.#dependencies.clock.dayRange(day)
    const records = await this.#dependencies.matches.listFinished(range)

    const matches = await this.#projectListEntries(
      records,
      locale,
      formattedNow,
      (formattedCreatedAt) => formattedCreatedAt.time,
    )

    const [previous, next] = await Promise.all([
      this.#dependencies.matches.findFinishedTime({ before: range.start }),
      this.#dependencies.matches.findFinishedTime({ from: range.end }),
    ])

    return {
      scope: 'finished',
      matches,
      day,
      previousDay: previous === null ? null : this.#localDay(previous),
      nextDay: next === null ? null : this.#localDay(next),
      isToday: day === this.#localDay(now),
    }
  }

  async readMatchScores(matchIds: readonly MatchId[]): Promise<ReadMatchScoresResult> {
    if (matchIds.length < 1 || new Set(matchIds).size !== matchIds.length)
      throw new Error('Match score batch must contain unique Matches')

    const recordsById = new Map(
      (await this.#dependencies.matches.listMatches(matchIds)).map((record) => [record.matchId, record]),
    )

    const records: MatchRecord[] = []

    for (const matchId of matchIds) {
      const record = recordsById.get(matchId)

      if (!record) return { ok: false, error: 'Unknown match', status: 404 }

      if (record.status === 'creating')
        throw new Error('Creating Match cannot be included in Match score polling')
      records.push(record)
    }

    const matches: MatchScorePollEntry[] = await Promise.all(
      records.map(async (record) => ({
        matchId: record.matchId,
        ...(await this.#readMatchScoreForList(record)),
      })),
    )

    return { ok: true, matches }
  }

  async readMatch<K extends GameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchResult<K>> {
    return this.#readKeyedMatch(matchId, locale, expectedGameKey, 'match')
  }

  async submitMatchCommand(
    matchId: MatchId,
    command: MatchCommand,
    expectedGameKey: GameKey,
  ): Promise<SubmitMatchCommandResult> {
    const record = await this.#dependencies.matches.findMatch(matchId)

    if (!record || record.gameKey !== expectedGameKey)
      return { ok: false, error: 'Unknown match', status: 404 }

    if (record.status === 'finished') {
      return { ok: false, error: 'Match is finished', status: 409 }
    }

    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }
    const result = await this.#dependencies.matchRoomClient(matchId).submitCommand(command)

    if (result._tag === 'accepted' && result.endsMatch) {
      await this.#archiveAndMarkFinished(matchId)

      return { ok: true, outcome: { _tag: 'accepted', acceptedSeq: result.acceptedSeq } }
    }

    if (result._tag === 'finalizing') {
      await this.#archiveAndMarkFinished(matchId)

      return { ok: false, error: 'match-locked', status: 409 }
    }

    if (result._tag === 'invalid-command') return { ok: false, error: 'invalid-command-body', status: 400 }

    if (result._tag === 'command-id-conflict') return { ok: false, error: 'command-id-conflict', status: 409 }

    return result._tag === 'accepted'
      ? { ok: true, outcome: { _tag: 'accepted', acceptedSeq: result.acceptedSeq } }
      : { ok: true, outcome: result }
  }

  async readMatchProtocol<K extends GameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>> {
    return this.#readKeyedMatch(matchId, locale, expectedGameKey, 'protocol')
  }

  async admitMatchLive(matchId: MatchId): ReturnType<SparringApplication['admitMatchLive']> {
    const record = await this.#dependencies.matches.findMatch(matchId)

    if (!record) return { _tag: 'unknown' }

    if (record.status === 'finished') return { _tag: 'finished' }

    if (record.status === 'creating')
      throw new Error('Creating Match cannot be admitted to the live transport')

    return { _tag: 'admitted' }
  }

  async #projectListEntries(
    records: readonly MatchListRecord[],
    locale: SupportedLocale,
    formattedNow: InstantPresentation,
    label: (formattedCreatedAt: InstantPresentation) => string,
  ): Promise<MatchListEntry[]> {
    return Promise.all(
      records.map(async (record) => {
        const score = await this.#readMatchScoreForList(record)

        const formattedCreatedAt = this.#dependencies.clock.instantPresentation(record.createdAt)

        return {
          matchId: record.matchId,
          gameKey: record.gameKey,
          shortGameTitle: registry[record.gameKey].meta.shortGameTitle[locale],
          createdAtIso: formattedCreatedAt.isoString,
          createdAtLabel: label(formattedCreatedAt),
          createdAtDate: formattedCreatedAt.date,
          createdAtIsToday: isSameLocalDate(formattedCreatedAt, formattedNow),
          participants: {
            A: presentParticipant(record.participants.A, locale),
            B: presentParticipant(record.participants.B, locale),
          },
          ...score,
          hasCustomFrameTarget: hasCustomFrameTarget(record.gameKey, score.score.frameTargetPointsBySeat),
        }
      }),
    )
  }

  #localDay(instant: UnixEpochMilliseconds): MatchListDay {
    const { year, month, day } = this.#dependencies.clock.instantPresentation(instant).date

    return `${year}-${month}-${day}`
  }

  // The overloads retain the requested game key after the catalog/room or archive identity checks below.
  // Enrichment preserves the owning state and presentation rather than re-stamping their key or lifecycle.
  #readKeyedMatch<K extends GameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
    view: 'match',
  ): Promise<ReadMatchResult<K>>
  #readKeyedMatch<K extends GameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
    view: 'protocol',
  ): Promise<ReadMatchProtocolResult<K>>
  async #readKeyedMatch(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: GameKey,
    view: 'match' | 'protocol',
  ): Promise<ReadMatchResult<GameKey> | ReadMatchProtocolResult<GameKey>> {
    const record = await this.#dependencies.matches.findMatch(matchId)

    if (!record || record.gameKey !== expectedGameKey)
      return { ok: false, error: 'Unknown match', status: 404 }

    if (record.status === 'finished') {
      return this.#readArchivedMatch(record, locale, expectedGameKey, view)
    }

    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }

    const roomClient = this.#dependencies.matchRoomClient(matchId)
    const room = view === 'match' ? await roomClient.getControls() : await roomClient.getProtocol()

    if (room._tag === 'finalizing') return this.#readFinalizingMatch(record, room, locale, expectedGameKey)

    if (room.state.matchId !== matchId || room.state.gameKey !== expectedGameKey)
      throw new Error('MatchRoom active identity conflicts with D1')

    const participants = await this.#hydrateParticipants(record, locale)
    const seatNames = { A: participants.A.displayName, B: participants.B.displayName }

    const base = {
      ok: true as const,
      lifecycle: 'active' as const,
      state: room.state,
      latestSeq: room.latestSeq,
      participants,
    }

    const active =
      room.game === undefined
        ? { ...base, controlPhase: 'between-frames' as const }
        : { ...base, controlPhase: 'frame-active' as const, game: room.game }

    if ('controls' in room) {
      const lastCommand = room.lastCommand ? presentLastCommand(room.lastCommand, seatNames) : undefined

      return lastCommand === undefined
        ? { ...active, controls: room.controls }
        : { ...active, controls: room.controls, lastCommand }
    }

    return {
      ...active,
      protocolRows: renderProtocolRows(room.protocolEntries, seatNames, this.#dependencies.clock).reverse(),
    }
  }

  async #archiveAndMarkFinished(matchId: MatchId): Promise<void> {
    let stage = 'prepare-archive'

    try {
      const transfer = await this.#dependencies.matchRoomClient(matchId).prepareArchive()
      stage = 'archive-in-d1'
      await this.#dependencies.matches.archiveFinished(transfer)
      stage = 'mark-d1-finished'
      await this.#dependencies.matches.markFinished(transfer)
    } catch (error) {
      console.error({ event: 'match-archive.failed', matchId, stage, error })
      throw error
    }
  }

  async #readMatchScoreForList(record: MatchRecord): Promise<MatchListScore> {
    if (record.status === 'finished')
      return {
        status: 'finished',
        endedAt: record.endedAt,
        latestSeq: record.finalSourceLatestSeq,
        score: record.finalScore,
      }

    if (record.status === 'creating') throw new Error('Creating Match cannot be included in the Match list')
    const room = await this.#dependencies.matchRoomClient(record.matchId).getScore()

    if (room._tag === 'active')
      return { status: 'active', endedAt: null, latestSeq: room.latestSeq, score: room.score }

    return {
      status: 'finished',
      endedAt: room.endedAt,
      latestSeq: room.latestSeq,
      score: room.score,
    }
  }

  async #hydrateParticipants(record: MatchRecord, locale: SupportedLocale) {
    return {
      A: presentParticipant(
        await this.#dependencies.players.readParticipant(record.participantRefs.A),
        locale,
      ),
      B: presentParticipant(
        await this.#dependencies.players.readParticipant(record.participantRefs.B),
        locale,
      ),
    }
  }

  async #readFinalizingMatch(
    record: MatchRecord,
    room:
      | Extract<Awaited<ReturnType<MatchRoomClient['getControls']>>, { _tag: 'finalizing' }>
      | Extract<Awaited<ReturnType<MatchRoomClient['getProtocol']>>, { _tag: 'finalizing' }>,
    locale: SupportedLocale,
    expectedGameKey: GameKey,
  ): Promise<ReadMatchResult<GameKey> | ReadMatchProtocolResult<GameKey>> {
    if (room.state.matchId !== record.matchId || room.state.gameKey !== expectedGameKey)
      throw new Error('MatchRoom finalizing identity conflicts with D1')

    const finished = await this.#presentFinishedMatch(record, room, locale)

    return 'protocolEntries' in room
      ? {
          ...finished,
          protocolRows: renderProtocolRows(
            room.protocolEntries,
            {
              A: finished.participants.A.displayName,
              B: finished.participants.B.displayName,
            },
            this.#dependencies.clock,
          ),
        }
      : finished
  }

  async #readArchivedMatch(
    record: Extract<MatchRecord, { status: 'finished' }>,
    locale: SupportedLocale,
    expectedGameKey: GameKey,
    view: 'match' | 'protocol',
  ): Promise<ReadMatchResult<GameKey> | ReadMatchProtocolResult<GameKey>> {
    let archive: FinishedMatchArchiveRecord | ProtocolArchiveRecord | null

    try {
      archive =
        view === 'protocol'
          ? await this.#dependencies.matches.findProtocolArchive(record.matchId)
          : await this.#dependencies.matches.findFinishedArchive(record.matchId)
    } catch (error) {
      const failure = error instanceof Error ? archiveReadFailure(error) : null

      if (failure) return failure
      throw error
    }

    if (!archive) return { ok: false, error: 'Missing finished match archive', status: 500 }
    const state = archive.state

    if (state.gameKey !== expectedGameKey) return { ok: false, error: 'Unknown match', status: 404 }

    const finished = await this.#presentFinishedMatch(
      record,
      {
        state,
        gameResult: archive.gameResult,
        latestSeq: archive.sourceLatestSeq,
        endedAt: record.endedAt,
      },
      locale,
    )

    return archive.entries === undefined
      ? finished
      : {
          ...finished,
          protocolRows: renderProtocolRows(
            archive.entries,
            {
              A: finished.participants.A.displayName,
              B: finished.participants.B.displayName,
            },
            this.#dependencies.clock,
          ),
        }
  }

  async #presentFinishedMatch(
    record: MatchRecord,
    match: Pick<
      Extract<Awaited<ReturnType<MatchRoomClient['getControls']>>, { _tag: 'finalizing' }>,
      'state' | 'gameResult' | 'latestSeq' | 'endedAt'
    >,
    locale: SupportedLocale,
  ): Promise<Extract<ReadMatchResult<GameKey>, { ok: true; lifecycle: 'finished' }>> {
    const endedAtPresentation = this.#dependencies.clock.instantPresentation(match.endedAt)

    return {
      ok: true,
      lifecycle: 'finished',
      state: match.state,
      gameResult: match.gameResult,
      latestSeq: match.latestSeq,
      endedAtIso: endedAtPresentation.isoString,
      endedAtTime: endedAtPresentation.time,
      endedAtDate: endedAtPresentation.date,
      endedAtIsToday: isSameLocalDate(endedAtPresentation, this.#dependencies.clock.nowPresentation()),
      participants: await this.#hydrateParticipants(record, locale),
      hasCustomFrameTarget: hasCustomFrameTarget(
        match.state.gameKey,
        match.state.targets.frameTargetPointsBySeat,
      ),
    }
  }
}

function archiveReadFailure(error: Error): ReadMatchFailure | null {
  if (error instanceof UnsupportedProtocolArchiveVersionError) {
    return { ok: false, error: 'Unsupported protocol archive version', status: 500 }
  }

  if (error instanceof ProtocolArchiveCorruptionError) {
    return { ok: false, error: 'Protocol archive corruption', status: 500 }
  }

  return null
}

function matchCreatedAtLabel(
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

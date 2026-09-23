import { type CreateMatchRequest, type MatchStateFor } from '@ks/competition'
import {
  type Clock,
  ClockFormatter,
  type Control,
  type FormattedInstant,
  type HydratedMatchParticipant,
  type MatchCommand,
  type MatchId,
  type MatchScoreProjection,
  type NonNegativeInteger,
  type PlayerRef,
  type ProtocolEntries,
  UnixEpochMilliseconds,
} from '@ks/core'
import { type GamePresentationFor, type RegisteredGameKey, registry } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type {
  Application,
  CreateMatchResult,
  HydratedMatchParticipants,
  MatchListEntry,
  MatchListPage,
  MatchListScope,
  MatchScorePollEntry,
  ReadMatchControlResult,
  ReadMatchFailure,
  ReadMatchProtocolResult,
  ReadMatchScoresResult,
  SubmitMatchCommandResult,
} from './contracts'
import {
  CreateMatchInput,
  MATCH_LIST_DEFAULT_PAGE_SIZE,
  MATCH_SCORE_POLL_MAX_MATCHES,
  MatchListPagination,
  RECENT_COMPLETED_MATCH_WINDOW_MS,
} from './contracts'
import type {
  MatchRoomClient,
  MatchRoomCompletionTransfer,
  MatchRoomInitializationInput,
} from './match-room-client'
import {
  ProtocolArchiveCorruptionError,
  type ProtocolArchiveRecord,
  renderLastCorrectableProtocolRow,
  renderProtocolRows,
  UnsupportedProtocolArchiveVersionError,
} from './protocol'

type CatalogMatchStatus = 'creating' | 'active' | 'finished'

type MatchRecordIdentity = {
  matchId: MatchId
  gameKey: RegisteredGameKey
  createdAt: UnixEpochMilliseconds
  participantRefs: { A: PlayerRef; B: PlayerRef }
}

type MatchRecord =
  | (MatchRecordIdentity & { status: Exclude<CatalogMatchStatus, 'finished'> })
  | (MatchRecordIdentity & {
      status: 'finished'
      endedAt: UnixEpochMilliseconds
      finalSourceLatestSeq: NonNegativeInteger
      finalScore: MatchScoreProjection
    })

type MatchListRecordQuery =
  | { readonly scope: 'live'; readonly completedSince: UnixEpochMilliseconds }
  | { readonly scope: 'completed' }

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

type ApplicationDependencies = {
  clock: Clock
  newMatchId(): MatchId
  newControlSecret(): string
  getOrCreateGuestPlayerRef(displayName: string): Promise<PlayerRef>
  hydrateParticipant(playerRef: PlayerRef, locale: SupportedLocale): Promise<HydratedMatchParticipant>
  listMatchRecords(
    input: MatchListRecordQuery & { readonly limit: number; readonly offset: number },
  ): Promise<MatchRecord[]>
  getMatchRecord(matchId: MatchId): Promise<MatchRecord | null>
  getMatchRecords(matchIds: readonly MatchId[]): Promise<MatchRecord[]>
  getProtocolArchive(matchId: MatchId): Promise<ProtocolArchiveRecord | null>
  beginMatchCreation(input: {
    matchId: MatchId
    gameKey: RegisteredGameKey
    seatAPlayerRef: PlayerRef
    seatBPlayerRef: PlayerRef
    createdAt: UnixEpochMilliseconds
  }): Promise<void>
  activateMatch(matchId: MatchId): Promise<void>
  archiveCompletedMatch(input: MatchRoomCompletionTransfer): Promise<void>
  markMatchFinished(input: MatchRoomCompletionTransfer): Promise<void>
  matchRoomClient(matchId: MatchId): MatchRoomClient
}

type ReadKeyedMatchSuccess<K extends RegisteredGameKey> = {
  ok: true
  state: MatchStateFor<K>
  latestSeq: number
  endedAt?: FormattedInstant
  endedAtIsToday?: boolean
  participants: HydratedMatchParticipants
  game?: GamePresentationFor<K>
  controls: readonly Control[]
  protocolEntries: ProtocolEntries
  lastEntry?: NonNullable<ReturnType<typeof renderLastCorrectableProtocolRow>>
}

type ReadKeyedMatchResult<K extends RegisteredGameKey> = ReadKeyedMatchSuccess<K> | ReadMatchFailure

function archiveReadFailure(error: Error): ReadMatchFailure | null {
  if (error instanceof UnsupportedProtocolArchiveVersionError) {
    return { ok: false, error: 'Unsupported protocol archive version', status: 500 }
  }

  if (error instanceof ProtocolArchiveCorruptionError) {
    return { ok: false, error: 'Protocol archive corruption', status: 500 }
  }

  return null
}

export function createApplicationWithDependencies(dependencies: ApplicationDependencies): Application {
  async function createMatch(input: CreateMatchInput): Promise<CreateMatchResult> {
    const parsed = v.safeParse(CreateMatchInput, input)

    if (!parsed.success) return { ok: false, error: 'Invalid match creation input', status: 400 }
    const matchId = dependencies.newMatchId()
    const controlSecret = dependencies.newControlSecret()
    const createdAt = dependencies.clock.now()
    const { playerNames, ...requestInput } = parsed.output

    const [seatAPlayerRef, seatBPlayerRef] = await Promise.all([
      dependencies.getOrCreateGuestPlayerRef(playerNames.A),
      dependencies.getOrCreateGuestPlayerRef(playerNames.B),
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

    await dependencies.beginMatchCreation({
      matchId,
      gameKey: request.gameKey,
      seatAPlayerRef,
      seatBPlayerRef,
      createdAt,
    })
    const result = await dependencies.matchRoomClient(matchId).initialize(request)

    if (result._tag === 'initialization-conflict')
      return { ok: false, error: 'Match already exists', status: 409 }
    await dependencies.activateMatch(matchId)

    return { ok: true, matchId }
  }

  async function listMatches(
    scope: MatchListScope,
    locale: SupportedLocale,
    pagination?: MatchListPagination,
  ): Promise<MatchListPage> {
    const { page } = v.parse(MatchListPagination, pagination ?? {})
    const now = dependencies.clock.now()

    const query: MatchListRecordQuery =
      scope === 'live'
        ? {
            scope,
            completedSince: v.parse(
              UnixEpochMilliseconds,
              Math.max(0, now - RECENT_COMPLETED_MATCH_WINDOW_MS),
            ),
          }
        : { scope }

    const records = await dependencies.listMatchRecords({
      ...query,
      limit: MATCH_LIST_DEFAULT_PAGE_SIZE + 1,
      offset: (page - 1) * MATCH_LIST_DEFAULT_PAGE_SIZE,
    })

    const pageRecords = records.slice(0, MATCH_LIST_DEFAULT_PAGE_SIZE)
    const formattedNow = ClockFormatter.format(now, locale, dependencies.clock.timeZone)

    const matches: MatchListEntry[] = await Promise.all(
      pageRecords.map(async (record) => {
        const [score, participants] = await Promise.all([
          readMatchScoreForList(record),
          hydrateParticipants(record, locale),
        ])

        const createdAt = ClockFormatter.format(record.createdAt, locale, dependencies.clock.timeZone)

        return {
          matchId: record.matchId,
          gameKey: record.gameKey,
          shortGameTitle: registry[record.gameKey].meta.shortGameTitle[locale],
          createdAtIso: createdAt.isoString,
          createdAtLabel: matchCreatedAtLabel(createdAt, formattedNow),
          createdAtDate: createdAt.date,
          createdAtIsToday: isSameLocalDate(createdAt, formattedNow),
          participants,
          ...score,
        }
      }),
    )

    const earliestRecentCompletionExpiry =
      scope === 'live'
        ? matches.reduce<number | undefined>((earliest, match) => {
            if (match.status !== 'finished') return earliest
            const expiresAt = match.endedAt + RECENT_COMPLETED_MATCH_WINDOW_MS

            return earliest === undefined ? expiresAt : Math.min(earliest, expiresAt)
          }, undefined)
        : undefined

    const result = {
      matches,
      page,
      hasNextPage: records.length > MATCH_LIST_DEFAULT_PAGE_SIZE,
    }

    if (earliestRecentCompletionExpiry === undefined) return result

    return {
      ...result,
      recentCompletionExpiresAfterMs: Math.max(0, earliestRecentCompletionExpiry - now),
    }
  }

  async function readMatchScores(matchIds: readonly MatchId[]): Promise<ReadMatchScoresResult> {
    if (
      matchIds.length < 1 ||
      matchIds.length > MATCH_SCORE_POLL_MAX_MATCHES ||
      new Set(matchIds).size !== matchIds.length
    )
      throw new Error(`Match score batch must contain 1 to ${MATCH_SCORE_POLL_MAX_MATCHES} unique Matches`)

    const recordsById = new Map(
      (await dependencies.getMatchRecords(matchIds)).map((record) => [record.matchId, record]),
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
        ...(await readMatchScoreForList(record)),
      })),
    )

    return { ok: true, matches }
  }

  async function readKeyedMatch<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadKeyedMatchResult<K>> {
    const record = await dependencies.getMatchRecord(matchId)

    if (!record || record.gameKey !== expectedGameKey)
      return { ok: false, error: 'Unknown match', status: 404 }

    if (record.status === 'finished') {
      return readArchivedMatch(record, locale, expectedGameKey)
    }

    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }

    const roomClient = dependencies.matchRoomClient(matchId)
    const roomResult = await roomClient.getControls()

    if (roomResult._tag === 'finalizing') {
      await archiveAndFinishRoom(matchId)
      const finishedRecord = await dependencies.getMatchRecord(matchId)

      if (finishedRecord?.status !== 'finished')
        throw new Error('Finalized Match is missing its finished D1 projection')

      return readArchivedMatch(finishedRecord, locale, expectedGameKey)
    }

    if (roomResult.state.matchId !== matchId || roomResult.state.gameKey !== expectedGameKey)
      throw new Error('MatchRoom active identity conflicts with D1')

    const protocolResult = await roomClient.getProtocol()

    if (protocolResult._tag === 'finalizing') {
      await archiveAndFinishRoom(matchId)
      const finishedRecord = await dependencies.getMatchRecord(matchId)

      if (finishedRecord?.status !== 'finished')
        throw new Error('Finalized Match is missing its finished D1 projection')

      return readArchivedMatch(finishedRecord, locale, expectedGameKey)
    }

    if (protocolResult.state.matchId !== matchId || protocolResult.state.gameKey !== expectedGameKey)
      throw new Error('MatchRoom active identity conflicts with D1')

    if (protocolResult.latestSeq < roomResult.latestSeq)
      throw new Error('MatchRoom Protocol cursor trails its Control projection')

    const participants = await hydrateParticipants(record, locale)
    const seatNames = { A: participants.A.displayName, B: participants.B.displayName }

    const protocolEntries = protocolResult.protocolEntries.filter(
      (entry) => entry.acceptedSeq <= roomResult.latestSeq,
    )

    const lastEntry = renderLastCorrectableProtocolRow(protocolEntries, seatNames, roomResult.latestSeq)

    const result: ReadKeyedMatchSuccess<K> = {
      ok: true,
      state: { ...roomResult.state, gameKey: expectedGameKey },
      latestSeq: roomResult.latestSeq,
      participants,
      controls: roomResult.controls,
      protocolEntries,
    }

    if (lastEntry !== undefined) result.lastEntry = lastEntry

    if (roomResult.game !== undefined) {
      result.game = roomResult.game
    }

    return result
  }

  async function readMatchControl<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchControlResult<K>> {
    const match = await readKeyedMatch(matchId, locale, expectedGameKey)

    if (!match.ok) return match

    return toControlResult(match)
  }

  async function submitMatchCommand(
    matchId: MatchId,
    command: MatchCommand,
    expectedGameKey: RegisteredGameKey,
  ): Promise<SubmitMatchCommandResult> {
    const record = await dependencies.getMatchRecord(matchId)

    if (!record || record.gameKey !== expectedGameKey)
      return { ok: false, error: 'Unknown match', status: 404 }

    if (record.status === 'finished') {
      return { ok: false, error: 'Match is finished', status: 409 }
    }

    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }
    const result = await dependencies.matchRoomClient(matchId).submitCommand(command)

    if (result._tag === 'accepted' && result.completesMatch) {
      await archiveAndFinishRoom(matchId)

      return { ok: true, outcome: { _tag: 'accepted', acceptedSeq: result.acceptedSeq } }
    }

    if (result._tag === 'finalizing') {
      await archiveAndFinishRoom(matchId)

      return { ok: false, error: 'match-locked', status: 409 }
    }

    if (result._tag === 'invalid-command') return { ok: false, error: 'invalid-command-body', status: 400 }

    if (result._tag === 'command-id-conflict') return { ok: false, error: 'command-id-conflict', status: 409 }

    return result._tag === 'accepted'
      ? { ok: true, outcome: { _tag: 'accepted', acceptedSeq: result.acceptedSeq } }
      : { ok: true, outcome: result }
  }

  async function readMatchProtocol<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>> {
    const match = await readKeyedMatch(matchId, locale, expectedGameKey)

    if (!match.ok) return match

    const control = toControlResult(match)

    const seatNames = {
      A: match.participants.A.displayName,
      B: match.participants.B.displayName,
    }

    const protocolRows = renderProtocolRows(
      match.protocolEntries,
      seatNames,
      dependencies.clock.timeZone,
      locale,
    )

    return {
      ...control,
      protocolRows: match.state.status === 'active' ? protocolRows.reverse() : protocolRows,
    }
  }

  async function archiveAndFinishRoom(matchId: MatchId): Promise<void> {
    const transfer = await dependencies.matchRoomClient(matchId).prepareArchive()
    await dependencies.archiveCompletedMatch(transfer)
    await dependencies.matchRoomClient(matchId).finalize()
    await dependencies.markMatchFinished(transfer)
  }

  function matchCreatedAtLabel(createdAt: FormattedInstant, today: FormattedInstant): string {
    if (isSameLocalDate(createdAt, today)) return createdAt.time

    const date = `${createdAt.date.day}.${createdAt.date.month}`

    return createdAt.date.year === today.date.year ? date : `${date}.${createdAt.date.year}`
  }

  async function readMatchScoreForList(record: MatchRecord): Promise<MatchListScore> {
    if (record.status === 'finished')
      return {
        status: 'finished',
        endedAt: record.endedAt,
        latestSeq: record.finalSourceLatestSeq,
        score: record.finalScore,
      }

    if (record.status === 'creating') throw new Error('Creating Match cannot be included in the Match list')
    const room = await dependencies.matchRoomClient(record.matchId).getScore()

    if (room._tag === 'active')
      return { status: 'active', endedAt: null, latestSeq: room.latestSeq, score: room.score }
    await archiveAndFinishRoom(record.matchId)
    const finished = await dependencies.getMatchRecord(record.matchId)

    if (finished?.status !== 'finished')
      throw new Error('Finalized Match is missing its finished D1 projection')

    return {
      status: 'finished',
      endedAt: finished.endedAt,
      latestSeq: finished.finalSourceLatestSeq,
      score: finished.finalScore,
    }
  }

  async function hydrateParticipants(record: MatchRecord, locale: SupportedLocale) {
    return {
      A: await dependencies.hydrateParticipant(record.participantRefs.A, locale),
      B: await dependencies.hydrateParticipant(record.participantRefs.B, locale),
    }
  }

  async function readArchivedMatch<K extends RegisteredGameKey>(
    record: Extract<MatchRecord, { status: 'finished' }>,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadKeyedMatchResult<K>> {
    let archive: ProtocolArchiveRecord | null

    try {
      archive = await dependencies.getProtocolArchive(record.matchId)
    } catch (error) {
      const failure = error instanceof Error ? archiveReadFailure(error) : null

      if (failure) return failure
      throw error
    }

    if (!archive) return { ok: false, error: 'Missing completed match archive', status: 500 }
    const state = archive.state

    if (state.gameKey !== expectedGameKey) return { ok: false, error: 'Unknown match', status: 404 }
    const endedAt = ClockFormatter.format(record.endedAt, locale, dependencies.clock.timeZone)
    const now = ClockFormatter.format(dependencies.clock.now(), locale, dependencies.clock.timeZone)

    return {
      ok: true,
      state: { ...state, gameKey: expectedGameKey },
      latestSeq: archive.sourceLatestSeq,
      endedAt,
      endedAtIsToday: isSameLocalDate(endedAt, now),
      participants: await hydrateParticipants(record, locale),
      controls: [],
      protocolEntries: archive.entries,
    }
  }

  function toControlResult<K extends RegisteredGameKey>(
    match: ReadKeyedMatchSuccess<K>,
  ): Extract<ReadMatchControlResult<K>, { ok: true }> {
    const { game: _game, protocolEntries: _protocolEntries, ...withoutGame } = match

    if (match.state.status === 'finished') {
      if (match.endedAt === undefined || match.endedAtIsToday === undefined)
        throw new Error('Finished Match read is missing its completion time')

      return {
        ...withoutGame,
        endedAt: match.endedAt,
        endedAtIsToday: match.endedAtIsToday,
        controlState: 'finished',
        controls: [],
      }
    }

    return match.game
      ? { ...withoutGame, controlState: 'frame-active', game: match.game, controls: match.controls }
      : { ...withoutGame, controlState: 'between-frames', controls: match.controls }
  }

  function isSameLocalDate(left: FormattedInstant, right: FormattedInstant): boolean {
    return (
      left.date.year === right.date.year &&
      left.date.month === right.date.month &&
      left.date.day === right.date.day
    )
  }

  return {
    createMatch,
    listMatches,
    readMatchScores,
    readMatchControl,
    submitMatchCommand,
    readMatchProtocol,
    admitSparringMatchLive: async (matchId) => {
      const record = await dependencies.getMatchRecord(matchId)

      if (!record) return { _tag: 'unknown' }

      if (record.status === 'finished') return { _tag: 'finished' }

      if (record.status === 'creating')
        throw new Error('Creating Match cannot be admitted to the live transport')

      return { _tag: 'admitted' }
    },
  }
}

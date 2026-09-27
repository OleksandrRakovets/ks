import { type CreateMatchRequest, type MatchStateFor } from '@ks/competition'
import {
  type Clock,
  type Control,
  type HydratedMatchParticipant,
  type InstantPresentation,
  type MatchCommand,
  type MatchId,
  type MatchScoreProjection,
  type NonNegativeInteger,
  type PlayerRef,
  type ProtocolEntries,
  UnixEpochMilliseconds,
} from '@ks/core'
import {
  type GamePresentationFor,
  type GameResult,
  type RegisteredGameKey,
  registry,
} from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type {
  CreateSparringMatchResult,
  FinishedMatchListPage,
  HydratedMatchParticipants,
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
} from '../contracts/sparring'
import { CreateSparringMatchInput, RECENT_FINISHED_MATCH_WINDOW_MS } from '../contracts/sparring'
import type {
  MatchRoomArchiveTransfer,
  MatchRoomClient,
  MatchRoomInitializationInput,
} from '../match-room-client'
import {
  type FinishedMatchArchiveRecord,
  ProtocolArchiveCorruptionError,
  type ProtocolArchiveRecord,
  renderLastCorrectableProtocolRow,
  renderProtocolRows,
  UnsupportedProtocolArchiveVersionError,
} from '../protocol'

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

type MatchListRecord = MatchRecord & { participants: HydratedMatchParticipants }

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

type SparringApplicationDependencies = {
  clock: Clock
  newMatchId(): MatchId
  newControlSecret(): string
  getOrCreateGuestPlayerRef(displayName: string): Promise<PlayerRef>
  hydrateParticipant(playerRef: PlayerRef, locale: SupportedLocale): Promise<HydratedMatchParticipant>
  listLiveMatchRecords(
    finishedSince: UnixEpochMilliseconds,
    locale: SupportedLocale,
  ): Promise<MatchListRecord[]>
  listFinishedMatchRecords(
    range: {
      readonly start: UnixEpochMilliseconds
      readonly end: UnixEpochMilliseconds
    },
    locale: SupportedLocale,
  ): Promise<MatchListRecord[]>
  findFinishedMatchTime(
    input: { readonly before: UnixEpochMilliseconds } | { readonly from: UnixEpochMilliseconds },
  ): Promise<UnixEpochMilliseconds | null>
  getMatchRecord(matchId: MatchId): Promise<MatchRecord | null>
  getMatchRecords(matchIds: readonly MatchId[]): Promise<MatchRecord[]>
  getFinishedMatchArchive(matchId: MatchId): Promise<FinishedMatchArchiveRecord | null>
  getProtocolArchive(matchId: MatchId): Promise<ProtocolArchiveRecord | null>
  beginMatchCreation(input: {
    matchId: MatchId
    gameKey: RegisteredGameKey
    seatAPlayerRef: PlayerRef
    seatBPlayerRef: PlayerRef
    createdAt: UnixEpochMilliseconds
  }): Promise<void>
  activateMatch(matchId: MatchId): Promise<void>
  archiveFinishedMatch(input: MatchRoomArchiveTransfer): Promise<void>
  markMatchFinished(input: MatchRoomArchiveTransfer): Promise<void>
  matchRoomClient(matchId: MatchId): MatchRoomClient
}

type ReadKeyedMatchBase<K extends RegisteredGameKey> = {
  ok: true
  state: MatchStateFor<K>
  latestSeq: number
  participants: HydratedMatchParticipants
}

type ReadKeyedActiveBase<K extends RegisteredGameKey> = ReadKeyedMatchBase<K> & {
  readKind: 'active'
  game?: GamePresentationFor<K>
}

type ReadKeyedControlSuccess<K extends RegisteredGameKey> = ReadKeyedActiveBase<K> & {
  controls: readonly Control[]
  lastEntry?: NonNullable<ReturnType<typeof renderLastCorrectableProtocolRow>>
}

type ReadKeyedProtocolSuccess<K extends RegisteredGameKey> = ReadKeyedActiveBase<K> & {
  protocolEntries: ProtocolEntries
}

type ReadKeyedFinishedSuccess<K extends RegisteredGameKey> = ReadKeyedMatchBase<K> & {
  readKind: 'finished'
  endedAtPresentation: InstantPresentation
  endedAtIsToday: boolean
  gameResult: GameResult | null
  protocolEntries: ProtocolEntries
}

type ReadKeyedControlResult<K extends RegisteredGameKey> =
  | ReadKeyedControlSuccess<K>
  | ReadKeyedFinishedSuccess<K>
  | ReadMatchFailure

type ReadKeyedProtocolResult<K extends RegisteredGameKey> =
  | ReadKeyedProtocolSuccess<K>
  | ReadKeyedFinishedSuccess<K>
  | ReadMatchFailure

function archiveReadFailure(error: Error): ReadMatchFailure | null {
  if (error instanceof UnsupportedProtocolArchiveVersionError) {
    return { ok: false, error: 'Unsupported protocol archive version', status: 500 }
  }

  if (error instanceof ProtocolArchiveCorruptionError) {
    return { ok: false, error: 'Protocol archive corruption', status: 500 }
  }

  return null
}

export function createSparringApplicationWithDependencies(
  dependencies: SparringApplicationDependencies,
): SparringApplication {
  async function createMatch(input: CreateSparringMatchInput): Promise<CreateSparringMatchResult> {
    const parsed = v.safeParse(CreateSparringMatchInput, input)

    if (!parsed.success) return { ok: false, error: 'Invalid match creation input', status: 400 }
    const matchId = dependencies.newMatchId()
    const controlSecret = dependencies.newControlSecret()
    const createdAt = dependencies.clock.nowMs()
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

  async function listLiveMatches(locale: SupportedLocale): Promise<LiveMatchListPage> {
    const now = dependencies.clock.nowMs()
    const formattedNow = dependencies.clock.instantPresentation(now)

    const records = await dependencies.listLiveMatchRecords(
      v.parse(UnixEpochMilliseconds, Math.max(0, now - RECENT_FINISHED_MATCH_WINDOW_MS)),
      locale,
    )

    const matches = await projectListEntries(records, locale, formattedNow, (formattedCreatedAt) =>
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

  async function listFinishedMatches(
    locale: SupportedLocale,
    requestedDay?: MatchListDay,
  ): Promise<FinishedMatchListPage> {
    const now = dependencies.clock.nowMs()
    const formattedNow = dependencies.clock.instantPresentation(now)

    const latest =
      requestedDay === undefined
        ? await dependencies.findFinishedMatchTime({
            before: v.parse(UnixEpochMilliseconds, Number.MAX_SAFE_INTEGER),
          })
        : null

    const day = requestedDay ?? (latest === null ? null : localDay(latest))

    if (day === null)
      return { scope: 'finished', matches: [], day: null, previousDay: null, nextDay: null, isToday: false }

    const range = dependencies.clock.dayRange(day)
    const records = await dependencies.listFinishedMatchRecords(range, locale)

    const matches = await projectListEntries(
      records,
      locale,
      formattedNow,
      (formattedCreatedAt) => formattedCreatedAt.time,
    )

    const [previous, next] = await Promise.all([
      dependencies.findFinishedMatchTime({ before: range.start }),
      dependencies.findFinishedMatchTime({ from: range.end }),
    ])

    return {
      scope: 'finished',
      matches,
      day,
      previousDay: previous === null ? null : localDay(previous),
      nextDay: next === null ? null : localDay(next),
      isToday: day === localDay(now),
    }
  }

  async function projectListEntries(
    records: readonly MatchListRecord[],
    locale: SupportedLocale,
    formattedNow: InstantPresentation,
    label: (formattedCreatedAt: InstantPresentation) => string,
  ): Promise<MatchListEntry[]> {
    return Promise.all(
      records.map(async (record) => {
        const score = await readMatchScoreForList(record)

        const formattedCreatedAt = dependencies.clock.instantPresentation(record.createdAt)

        return {
          matchId: record.matchId,
          gameKey: record.gameKey,
          shortGameTitle: registry[record.gameKey].meta.shortGameTitle[locale],
          createdAtIso: formattedCreatedAt.isoString,
          createdAtLabel: label(formattedCreatedAt),
          createdAtDate: formattedCreatedAt.date,
          createdAtIsToday: isSameLocalDate(formattedCreatedAt, formattedNow),
          participants: record.participants,
          ...score,
          hasCustomFrameTarget: hasCustomFrameTarget(record.gameKey, score.score.frameTargetPointsBySeat),
        }
      }),
    )
  }

  function localDay(instant: UnixEpochMilliseconds): MatchListDay {
    const { year, month, day } = dependencies.clock.instantPresentation(instant).date

    return `${year}-${month}-${day}`
  }

  async function readMatchScores(matchIds: readonly MatchId[]): Promise<ReadMatchScoresResult> {
    if (matchIds.length < 1 || new Set(matchIds).size !== matchIds.length)
      throw new Error('Match score batch must contain unique Matches')

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

  function readKeyedMatch<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
    view: 'match',
  ): Promise<ReadKeyedControlResult<K>>
  function readKeyedMatch<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
    view: 'protocol',
  ): Promise<ReadKeyedProtocolResult<K>>
  async function readKeyedMatch<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
    view: 'match' | 'protocol',
  ): Promise<ReadKeyedControlResult<K> | ReadKeyedProtocolResult<K>> {
    const record = await dependencies.getMatchRecord(matchId)

    if (!record || record.gameKey !== expectedGameKey)
      return { ok: false, error: 'Unknown match', status: 404 }

    if (record.status === 'finished') {
      return readArchivedMatch(record, locale, expectedGameKey, view)
    }

    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }

    const roomClient = dependencies.matchRoomClient(matchId)

    if (view === 'match') {
      const room = await roomClient.getControls()

      if (room._tag === 'finalizing') return readFinalizingMatch(record, room, [], locale, expectedGameKey)

      if (room.state.matchId !== matchId || room.state.gameKey !== expectedGameKey)
        throw new Error('MatchRoom active identity conflicts with D1')

      const participants = await hydrateParticipants(record, locale)
      const seatNames = { A: participants.A.displayName, B: participants.B.displayName }

      const lastEntry = renderLastCorrectableProtocolRow(
        room.lastPlayerEntry ? [room.lastPlayerEntry] : [],
        seatNames,
        room.latestSeq,
      )

      const result: ReadKeyedControlSuccess<K> = {
        ok: true,
        readKind: 'active',
        state: { ...room.state, gameKey: expectedGameKey },
        latestSeq: room.latestSeq,
        participants,
        controls: room.controls,
      }

      if (lastEntry) result.lastEntry = lastEntry

      if (room.game !== undefined) result.game = room.game

      return result
    }

    const room = await roomClient.getProtocol()
    const protocolEntries = room.protocolEntries

    if (room._tag === 'finalizing')
      return readFinalizingMatch(record, room, protocolEntries, locale, expectedGameKey)

    if (room.state.matchId !== matchId || room.state.gameKey !== expectedGameKey)
      throw new Error('MatchRoom active identity conflicts with D1')

    const result: ReadKeyedProtocolSuccess<K> = {
      ok: true,
      readKind: 'active',
      state: { ...room.state, gameKey: expectedGameKey },
      latestSeq: room.latestSeq,
      participants: await hydrateParticipants(record, locale),
      protocolEntries,
    }

    if (room.game !== undefined) result.game = room.game

    return result
  }

  async function readMatch<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchResult<K>> {
    const match = await readKeyedMatch(matchId, locale, expectedGameKey, 'match')

    if (!match.ok) return match

    return toMatchResult(match)
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

    if (result._tag === 'accepted' && result.endsMatch) {
      await archiveAndMarkFinished(matchId)

      return { ok: true, outcome: { _tag: 'accepted', acceptedSeq: result.acceptedSeq } }
    }

    if (result._tag === 'finalizing') {
      await archiveAndMarkFinished(matchId)

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
    const match = await readKeyedMatch(matchId, locale, expectedGameKey, 'protocol')

    if (!match.ok) return match

    const seatNames = {
      A: match.participants.A.displayName,
      B: match.participants.B.displayName,
    }

    const protocolRows = renderProtocolRows(match.protocolEntries, seatNames, dependencies.clock)

    if (match.readKind === 'finished') {
      return { ...toFinishedMatchResult(match), protocolRows }
    }

    const active = {
      ok: true as const,
      lifecycle: 'active' as const,
      state: { ...match.state, status: 'active' as const },
      latestSeq: match.latestSeq,
      participants: match.participants,
      protocolRows: protocolRows.reverse(),
    }

    return match.game
      ? { ...active, controlPhase: 'frame-active', game: match.game }
      : { ...active, controlPhase: 'between-frames' }
  }

  async function archiveAndMarkFinished(matchId: MatchId): Promise<void> {
    let stage = 'prepare-archive'

    try {
      const transfer = await dependencies.matchRoomClient(matchId).prepareArchive()
      stage = 'archive-in-d1'
      await dependencies.archiveFinishedMatch(transfer)
      stage = 'mark-d1-finished'
      await dependencies.markMatchFinished(transfer)
    } catch (error) {
      console.error({ event: 'match-archive.failed', matchId, stage, error })
      throw error
    }
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

    return {
      status: 'finished',
      endedAt: room.endedAt,
      latestSeq: room.latestSeq,
      score: room.score,
    }
  }

  async function hydrateParticipants(record: MatchRecord, locale: SupportedLocale) {
    return {
      A: await dependencies.hydrateParticipant(record.participantRefs.A, locale),
      B: await dependencies.hydrateParticipant(record.participantRefs.B, locale),
    }
  }

  async function readFinalizingMatch<K extends RegisteredGameKey>(
    record: MatchRecord,
    room:
      | Extract<Awaited<ReturnType<MatchRoomClient['getControls']>>, { _tag: 'finalizing' }>
      | Extract<Awaited<ReturnType<MatchRoomClient['getProtocol']>>, { _tag: 'finalizing' }>,
    protocolEntries: ProtocolEntries,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadKeyedFinishedSuccess<K> | ReadMatchFailure> {
    if (room.state.matchId !== record.matchId || room.state.gameKey !== expectedGameKey)
      throw new Error('MatchRoom finalizing identity conflicts with D1')

    const endedAtPresentation = dependencies.clock.instantPresentation(room.endedAt)
    const formattedNow = dependencies.clock.nowPresentation()

    return {
      ok: true,
      readKind: 'finished',
      state: { ...room.state, gameKey: expectedGameKey },
      gameResult: room.gameResult,
      latestSeq: room.latestSeq,
      endedAtPresentation,
      endedAtIsToday: isSameLocalDate(endedAtPresentation, formattedNow),
      participants: await hydrateParticipants(record, locale),
      protocolEntries,
    }
  }

  async function readArchivedMatch<K extends RegisteredGameKey>(
    record: Extract<MatchRecord, { status: 'finished' }>,
    locale: SupportedLocale,
    expectedGameKey: K,
    view: 'match' | 'protocol',
  ): Promise<ReadKeyedFinishedSuccess<K> | ReadMatchFailure> {
    let archive: FinishedMatchArchiveRecord | ProtocolArchiveRecord | null

    try {
      archive =
        view === 'protocol'
          ? await dependencies.getProtocolArchive(record.matchId)
          : await dependencies.getFinishedMatchArchive(record.matchId)
    } catch (error) {
      const failure = error instanceof Error ? archiveReadFailure(error) : null

      if (failure) return failure
      throw error
    }

    if (!archive) return { ok: false, error: 'Missing finished match archive', status: 500 }
    const state = archive.state

    if (state.gameKey !== expectedGameKey) return { ok: false, error: 'Unknown match', status: 404 }
    const endedAtPresentation = dependencies.clock.instantPresentation(record.endedAt)
    const formattedNow = dependencies.clock.nowPresentation()

    return {
      ok: true,
      readKind: 'finished',
      state: { ...state, gameKey: expectedGameKey },
      gameResult: archive.gameResult,
      latestSeq: archive.sourceLatestSeq,
      endedAtPresentation,
      endedAtIsToday: isSameLocalDate(endedAtPresentation, formattedNow),
      participants: await hydrateParticipants(record, locale),
      protocolEntries: archive.entries ?? [],
    }
  }

  function toMatchResult<K extends RegisteredGameKey>(
    match: ReadKeyedControlSuccess<K> | ReadKeyedFinishedSuccess<K>,
  ): Extract<ReadMatchResult<K>, { ok: true }> {
    if (match.readKind === 'finished') return toFinishedMatchResult(match)

    const active =
      match.lastEntry === undefined
        ? {
            ok: true as const,
            lifecycle: 'active' as const,
            state: { ...match.state, status: 'active' as const },
            latestSeq: match.latestSeq,
            controls: match.controls,
            participants: match.participants,
          }
        : {
            ok: true as const,
            lifecycle: 'active' as const,
            state: { ...match.state, status: 'active' as const },
            latestSeq: match.latestSeq,
            controls: match.controls,
            participants: match.participants,
            lastEntry: match.lastEntry,
          }

    if (match.game) return { ...active, controlPhase: 'frame-active', game: match.game }

    return { ...active, controlPhase: 'between-frames' }
  }

  function toFinishedMatchResult<K extends RegisteredGameKey>(
    match: ReadKeyedFinishedSuccess<K>,
  ): Extract<ReadMatchResult<K>, { ok: true; lifecycle: 'finished' }> {
    return {
      ok: true,
      lifecycle: 'finished',
      state: { ...match.state, status: 'finished' },
      gameResult: match.gameResult ?? null,
      latestSeq: match.latestSeq,
      endedAtIso: match.endedAtPresentation.isoString,
      endedAtTime: match.endedAtPresentation.time,
      endedAtDate: match.endedAtPresentation.date,
      endedAtIsToday: match.endedAtIsToday,
      participants: match.participants,
      hasCustomFrameTarget: hasCustomFrameTarget(
        match.state.gameKey,
        match.state.targets.frameTargetPointsBySeat,
      ),
    }
  }

  function isSameLocalDate(left: InstantPresentation, right: InstantPresentation): boolean {
    return (
      left.date.year === right.date.year &&
      left.date.month === right.date.month &&
      left.date.day === right.date.day
    )
  }

  return {
    createMatch,
    listLiveMatches,
    listFinishedMatches,
    readMatchScores,
    readMatch,
    submitMatchCommand,
    readMatchProtocol,
    admitMatchLive: async (matchId) => {
      const record = await dependencies.getMatchRecord(matchId)

      if (!record) return { _tag: 'unknown' }

      if (record.status === 'finished') return { _tag: 'finished' }

      if (record.status === 'creating')
        throw new Error('Creating Match cannot be admitted to the live transport')

      return { _tag: 'admitted' }
    },
  }
}

function hasCustomFrameTarget(
  gameKey: RegisteredGameKey,
  target: MatchScoreProjection['frameTargetPointsBySeat'],
): boolean {
  const defaults = registry[gameKey].meta.defaultFrameTargetPointsBySeat

  return target.A !== defaults.A || target.B !== defaults.B
}

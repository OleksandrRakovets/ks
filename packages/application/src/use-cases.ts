import { type CreateMatchRequest, type MatchStateFor } from '@ks/competition'
import {
  type ControlSections,
  emptyControlSections,
  type HydratedMatchParticipant,
  type MatchCommand,
  type MatchId,
  type PlayerRef,
  type UnixEpochMilliseconds,
} from '@ks/core'
import { type ControlProjectionFor, type RegisteredGameKey, registry } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type {
  Application,
  CreateMatchInput,
  CreateMatchResult,
  HydratedMatchParticipants,
  MatchListEntry,
  ReadMatchControlResult,
  ReadMatchFailure,
  ReadMatchProtocolResult,
  SubmitMatchCommandResult,
} from './contracts'
import { CreateMatchInputSchema } from './contracts'
import type { MatchRoomClient, MatchRoomCreateRequest, MatchRoomFinalizationData } from './match-room-client'
import {
  ProtocolArchiveCorruptionError,
  type ProtocolArchiveRecord,
  renderProtocolRows,
  UnsupportedProtocolArchiveVersionError,
} from './protocol'

type CatalogMatchStatus = 'creating' | 'active' | 'finalizing' | 'finished'

type MatchRecord = {
  matchId: MatchId
  gameKey: RegisteredGameKey
  status: CatalogMatchStatus
  createdAt: UnixEpochMilliseconds
  participantRefs: { A: PlayerRef; B: PlayerRef }
}

type ApplicationDependencies = {
  newMatchId(): MatchId
  newControlSecret(): string
  now(): UnixEpochMilliseconds
  getOrCreateGuestPlayerRef(displayName: string): Promise<PlayerRef>
  hydrateParticipant(playerRef: PlayerRef, locale: SupportedLocale): Promise<HydratedMatchParticipant>
  listMatchRecords(): Promise<MatchRecord[]>
  getMatchRecord(matchId: MatchId): Promise<MatchRecord | null>
  getProtocolArchive(matchId: MatchId): Promise<ProtocolArchiveRecord | null>
  beginMatchCreation(input: {
    matchId: MatchId
    gameKey: RegisteredGameKey
    seatAPlayerRef: PlayerRef
    seatBPlayerRef: PlayerRef
    createdAt: UnixEpochMilliseconds
  }): Promise<void>
  activateMatch(matchId: MatchId): Promise<void>
  archiveCompletedMatch(input: MatchRoomFinalizationData & { matchId: MatchId }): Promise<void>
  finishCompletedMatch(matchId: MatchId): Promise<void>
  matchRoom: MatchRoomClient
}

type ReadKeyedMatchSuccess<K extends RegisteredGameKey> = {
  ok: true
  state: MatchStateFor<K>
  latestSeq: number
  participants: HydratedMatchParticipants
  controlProjection?: ControlProjectionFor<K>
  controlSections?: ControlSections
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
    const parsed = v.safeParse(CreateMatchInputSchema, input)
    if (!parsed.success) return { ok: false, error: 'Invalid match creation input', status: 400 }
    const matchId = dependencies.newMatchId()
    const controlSecret = dependencies.newControlSecret()
    const createdAt = dependencies.now()
    const { playerNames, ...requestInput } = parsed.output
    const [seatAPlayerRef, seatBPlayerRef] = await Promise.all([
      dependencies.getOrCreateGuestPlayerRef(playerNames.A),
      dependencies.getOrCreateGuestPlayerRef(playerNames.B),
    ])
    const participants: CreateMatchRequest['participants'] = [
      { seat: 'A', playerRef: seatAPlayerRef },
      { seat: 'B', playerRef: seatBPlayerRef },
    ]
    const request: MatchRoomCreateRequest = {
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
    const result = await dependencies.matchRoom.create(request)
    if (!result.ok) return result
    await dependencies.activateMatch(matchId)
    return { ok: true, matchId }
  }

  async function listMatches(locale: SupportedLocale): Promise<MatchListEntry[]> {
    const records = await dependencies.listMatchRecords()
    await Promise.all(
      records.map(async (record) => {
        if (record.status === 'finalizing') await disposeAndFinishRoom(record.matchId)
      }),
    )
    return await Promise.all(
      records.map(async (record) => ({
        matchId: record.matchId,
        gameKey: record.gameKey,
        gameTitle: registry[record.gameKey].meta.title[locale],
        status: record.status === 'active' ? ('active' as const) : ('finished' as const),
        createdAt: record.createdAt,
        participants: {
          A: await dependencies.hydrateParticipant(record.participantRefs.A, locale),
          B: await dependencies.hydrateParticipant(record.participantRefs.B, locale),
        },
      })),
    )
  }

  async function readKeyedMatch<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadKeyedMatchResult<K>> {
    const record = await dependencies.getMatchRecord(matchId)
    if (!record || record.gameKey !== expectedGameKey)
      return { ok: false, error: 'Unknown match', status: 404 }
    if (record.status === 'finalizing') await disposeAndFinishRoom(matchId)
    if (record.status === 'finalizing' || record.status === 'finished') {
      return await readArchivedMatch(record, locale, expectedGameKey)
    }
    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }

    const roomResult = await dependencies.matchRoom.readControl(matchId, expectedGameKey)
    if (!roomResult.ok) {
      if (roomResult.error === 'Match is finalizing') {
        await archiveAndFinishRoom(matchId)
        return await readArchivedMatch(record, locale, expectedGameKey)
      }
      const updatedRecord = await dependencies.getMatchRecord(matchId)
      if (updatedRecord && updatedRecord.status !== 'active') {
        if (updatedRecord.status === 'finalizing') await disposeAndFinishRoom(matchId)
        if (updatedRecord.gameKey !== expectedGameKey)
          return { ok: false, error: 'Unknown match', status: 404 }
        return await readArchivedMatch(updatedRecord, locale, expectedGameKey)
      }
      const status = roomResult.error === 'Unknown match' ? 404 : roomResult.status === 409 ? 409 : 502
      return { ok: false, error: roomResult.error, status }
    }

    const result: ReadKeyedMatchSuccess<K> = {
      ok: true,
      state: roomResult.state,
      latestSeq: roomResult.latestSeq,
      participants: await hydrateParticipants(record, locale),
      controlSections: roomResult.controlSections,
    }
    if (roomResult.controlProjection !== undefined) {
      result.controlProjection = roomResult.controlProjection
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
    const controlSections = match.controlSections ?? emptyControlSections()
    return match.controlProjection
      ? { ...match, controlState: 'frame-active', controlProjection: match.controlProjection, controlSections }
      : { ...match, controlState: 'between-frames', controlSections }
  }

  async function submitMatchCommand<K extends RegisteredGameKey>(
    matchId: MatchId,
    command: MatchCommand,
    expectedGameKey: K,
  ): Promise<SubmitMatchCommandResult> {
    const record = await dependencies.getMatchRecord(matchId)
    if (!record || record.gameKey !== expectedGameKey)
      return { ok: false, error: 'Unknown match', status: 404 }
    if (record.status === 'finalizing') await disposeAndFinishRoom(matchId)
    if (record.status === 'finalizing' || record.status === 'finished') {
      return { ok: false, error: 'Match is finished', status: 409 }
    }
    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }
    const result = await dependencies.matchRoom.submitCommand(matchId, command)
    if (result.ok && result.outcome._tag === 'accepted' && result.finalizing) {
      await archiveAndFinishRoom(matchId)
      return { ok: true, outcome: result.outcome }
    }
    if (!result.ok && result.error === 'match-locked') await archiveAndFinishRoom(matchId)
    if (result.ok) return { ok: true, outcome: result.outcome }
    return result
  }

  async function readMatchProtocol<K extends RegisteredGameKey>(
    matchId: MatchId,
    timeZone: string,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>> {
    const record = await dependencies.getMatchRecord(matchId)
    if (!record || record.gameKey !== expectedGameKey)
      return { ok: false, error: 'Unknown match', status: 404 }
    const participants = await hydrateParticipants(record, locale)
    const seatNames = { A: participants.A.displayName, B: participants.B.displayName }
    if (record.status === 'active') {
      const room = await dependencies.matchRoom.readProtocol(matchId, expectedGameKey)
      if (!room.ok) {
        if (room.error === 'Match is finalizing') {
          await archiveAndFinishRoom(matchId)
          return readMatchProtocol(matchId, timeZone, locale, expectedGameKey)
        }
        return room
      }
      return {
        ok: true,
        state: room.state,
        latestSeq: room.latestSeq,
        participants,
        protocolRows: renderProtocolRows(room.protocolEntries, seatNames, timeZone, locale).reverse(),
      }
    } else {
      if (record.status === 'finalizing') await disposeAndFinishRoom(matchId)
      let archive: ProtocolArchiveRecord | null
      try {
        archive = await dependencies.getProtocolArchive(matchId)
      } catch (error) {
        const failure = error instanceof Error ? archiveReadFailure(error) : null
        if (failure) return failure
        throw error
      }
      if (!archive) return { ok: false, error: 'Missing protocol archive', status: 500 }
      if (archive.state.gameKey !== expectedGameKey) return { ok: false, error: 'Unknown match', status: 404 }
      return {
        ok: true,
        state: { ...archive.state, gameKey: expectedGameKey },
        latestSeq: archive.sourceLatestSeq,
        participants,
        protocolRows: renderProtocolRows(archive.entries, seatNames, timeZone, locale),
      }
    }
  }

  async function archiveAndFinishRoom(matchId: MatchId): Promise<void> {
    const result = await dependencies.matchRoom.finalization(matchId)
    if (!result.ok) throw new Error(result.error)
    await dependencies.archiveCompletedMatch(result.data)
    await disposeAndFinishRoom(matchId)
  }

  async function disposeAndFinishRoom(matchId: MatchId): Promise<void> {
    const result = await dependencies.matchRoom.disposeFinalized(matchId)
    if (!result.ok) throw new Error(result.error)
    await dependencies.finishCompletedMatch(matchId)
  }

  async function hydrateParticipants(record: MatchRecord, locale: SupportedLocale) {
    return {
      A: await dependencies.hydrateParticipant(record.participantRefs.A, locale),
      B: await dependencies.hydrateParticipant(record.participantRefs.B, locale),
    }
  }

  async function readArchivedMatch<K extends RegisteredGameKey>(
    record: MatchRecord,
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
    return {
      ok: true,
      state: { ...state, gameKey: expectedGameKey },
      latestSeq: archive.sourceLatestSeq,
      participants: await hydrateParticipants(record, locale),
    }
  }

  return {
    createMatch,
    listMatches,
    readMatchControl,
    submitMatchCommand,
    readMatchProtocol,
    streamMatchUpdates: async (matchId, since) => {
      const record = await dependencies.getMatchRecord(matchId)
      if (!record) return Response.json({ ok: false, error: 'Unknown match' }, { status: 404 })
      if (record.status === 'finalizing') await disposeAndFinishRoom(matchId)
      if (record.status === 'finalizing' || record.status === 'finished') {
        return Response.json({ ok: false, error: 'Match is finished' }, { status: 410 })
      }
      if (record.status !== 'active')
        return Response.json({ ok: false, error: 'Unknown match' }, { status: 404 })
      const response = await dependencies.matchRoom.stream(matchId, since)
      if (response.status !== 409) return response
      await archiveAndFinishRoom(matchId)
      return Response.json({ ok: false, error: 'Match is finished' }, { status: 410 })
    },
  }
}

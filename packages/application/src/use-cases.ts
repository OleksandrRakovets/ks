import { type CreateMatchRequest, type MatchStateFor } from '@ks/competition'
import {
  type Control,
  type HydratedMatchParticipant,
  type MatchCommand,
  type MatchId,
  type PlayerRef,
  type UnixEpochMilliseconds,
} from '@ks/core'
import { type GamePresentationFor, type RegisteredGameKey, registry } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type {
  Application,
  CreateMatchResult,
  HydratedMatchParticipants,
  MatchListEntry,
  ReadMatchControlResult,
  ReadMatchFailure,
  ReadMatchProtocolResult,
  SubmitMatchCommandResult,
} from './contracts'
import { CreateMatchInput } from './contracts'
import type {
  MatchRoomClient,
  MatchRoomCompletionTransfer,
  MatchRoomInitializationInput,
} from './match-room-client'
import {
  ProtocolArchiveCorruptionError,
  type ProtocolArchiveRecord,
  renderProtocolRows,
  UnsupportedProtocolArchiveVersionError,
} from './protocol'

type CatalogMatchStatus = 'creating' | 'active' | 'finished'

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
  archiveCompletedMatch(input: MatchRoomCompletionTransfer): Promise<void>
  markMatchFinished(matchId: MatchId, endedAt: UnixEpochMilliseconds): Promise<void>
  matchRoomClient(matchId: MatchId): MatchRoomClient
}

type ReadKeyedMatchSuccess<K extends RegisteredGameKey> = {
  ok: true
  state: MatchStateFor<K>
  latestSeq: number
  participants: HydratedMatchParticipants
  game?: GamePresentationFor<K>
  controls: readonly Control[]
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

  async function listMatches(locale: SupportedLocale): Promise<MatchListEntry[]> {
    const records = await dependencies.listMatchRecords()
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
    if (record.status === 'finished') {
      return await readArchivedMatch(record, locale, expectedGameKey)
    }
    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }

    const roomResult = await dependencies.matchRoomClient(matchId).getControls()
    if (roomResult._tag === 'finalizing') {
      await archiveAndFinishRoom(matchId)
      return await readArchivedMatch(record, locale, expectedGameKey)
    }
    if (roomResult.state.matchId !== matchId || roomResult.state.gameKey !== expectedGameKey)
      throw new Error('MatchRoom active identity conflicts with D1')

    const result: ReadKeyedMatchSuccess<K> = {
      ok: true,
      state: { ...roomResult.state, gameKey: expectedGameKey },
      latestSeq: roomResult.latestSeq,
      participants: await hydrateParticipants(record, locale),
      controls: roomResult.controls,
    }
    if (roomResult.game !== undefined) {
      // SAFETY: the preceding MatchRoom state key check correlates its game presentation with expectedGameKey.
      result.game = roomResult.game as GamePresentationFor<K>
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
    const { game: _game, ...withoutGame } = match
    if (match.state.status === 'finished') return { ...withoutGame, controlState: 'finished', controls: [] }
    return match.game
      ? { ...match, controlState: 'frame-active', game: match.game, controls: match.controls }
      : { ...withoutGame, controlState: 'between-frames', controls: match.controls }
  }

  async function submitMatchCommand<K extends RegisteredGameKey>(
    matchId: MatchId,
    command: MatchCommand,
    expectedGameKey: K,
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
      const room = await dependencies.matchRoomClient(matchId).getProtocol()
      if (room._tag === 'finalizing') {
        await archiveAndFinishRoom(matchId)
        return readMatchProtocol(matchId, timeZone, locale, expectedGameKey)
      }
      if (room.state.matchId !== matchId || room.state.gameKey !== expectedGameKey)
        throw new Error('MatchRoom active identity conflicts with D1')
      return {
        ok: true,
        // SAFETY: runtime identity correlation above establishes expectedGameKey K.
        state: room.state as MatchStateFor<K>,
        latestSeq: room.latestSeq,
        participants,
        protocolRows: renderProtocolRows(room.protocolEntries, seatNames, timeZone, locale).reverse(),
      }
    } else {
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
    const transfer = await dependencies.matchRoomClient(matchId).prepareArchive()
    await dependencies.archiveCompletedMatch(transfer)
    await dependencies.matchRoomClient(matchId).finalize()
    await dependencies.markMatchFinished(matchId, transfer.endedAt)
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
      controls: [],
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
      if (record.status === 'finished') {
        return Response.json({ ok: false, error: 'Match is finished' }, { status: 410 })
      }
      if (record.status !== 'active')
        return Response.json({ ok: false, error: 'Unknown match' }, { status: 404 })
      const stream = await dependencies.matchRoomClient(matchId).stream(since)
      if (stream._tag === 'active') return stream.response
      await archiveAndFinishRoom(matchId)
      return Response.json({ ok: false, error: 'Match is finished' }, { status: 410 })
    },
  }
}

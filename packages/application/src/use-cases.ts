import { normalizeMatchId, type CreateMatchRequest } from '@ks/competition'
import { MatchSnapshotSchema, type CommandId, type ControlCommand, type PlayerRef, type UnixEpochMilliseconds } from '@ks/core'
import { isRegisteredGameKey, registry } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type {
  Application,
  CommandMatchResult,
  CreateMatchInput,
  CreateMatchResult,
  HydratedParticipant,
  MatchListEntry,
  ReadMatchProtocolResult,
  ReadMatchResult,
} from './contracts'
import type { MatchRoomClient, MatchRoomCreateRequest, MatchRoomFinalizationData } from './match-room-client'
import { deriveProtocolRows, PROTOCOL_ARCHIVE_VERSION, ProtocolArchiveRowsSchema, renderProtocolRows } from './protocol'

type MatchListRecord = {
  matchId: string
  gameKey: string
  status: string
  createdAt: UnixEpochMilliseconds
  participantRefs: { A: string; B: string }
}

type MatchRecord = MatchListRecord

type ApplicationDependencies = {
  newMatchId(): string
  newControlSecret(): string
  now(): UnixEpochMilliseconds
  getOrCreateGuestPlayerRef(displayName: string): Promise<PlayerRef>
  hydrateParticipant(playerRef: string, locale: SupportedLocale): Promise<HydratedParticipant>
  listMatchRecords(): Promise<MatchListRecord[]>
  getMatchRecord(matchId: string): Promise<MatchRecord | null>
  getProtocolArchive(
    matchId: string,
  ): Promise<{ sourceLatestSeq: number; protocolVersion: number; rowsJson: string; snapshotJson: string } | null>
  beginMatchCreation(input: {
    matchId: string
    gameKey: string
    seatAPlayerRef: string
    seatBPlayerRef: string
    createdAt: UnixEpochMilliseconds
  }): Promise<void>
  activateMatch(matchId: string): Promise<void>
  archiveCompletedMatch(input: MatchRoomFinalizationData & { matchId: string }): Promise<void>
  finishCompletedMatch(matchId: string): Promise<void>
  matchRoom: MatchRoomClient
}

const ProtocolArchiveRowsJsonSchema = v.pipe(v.string(), v.parseJson(), ProtocolArchiveRowsSchema)
const MatchSnapshotJsonSchema = v.pipe(v.string(), v.parseJson(), MatchSnapshotSchema)

export function createApplicationWithDependencies(dependencies: ApplicationDependencies): Application {
  async function createMatch(input: CreateMatchInput): Promise<CreateMatchResult> {
    const matchId = dependencies.newMatchId()
    const controlSecret = dependencies.newControlSecret()
    const createdAt = dependencies.now()
    const { playerNames, ...requestInput } = input
    const [seatAPlayerRef, seatBPlayerRef] = await Promise.all([
      dependencies.getOrCreateGuestPlayerRef(playerNames.A),
      dependencies.getOrCreateGuestPlayerRef(playerNames.B),
    ])
    const participants: CreateMatchRequest['participants'] = [
      { seat: 'A', playerRef: seatAPlayerRef },
      { seat: 'B', playerRef: seatBPlayerRef },
    ]
    const request: MatchRoomCreateRequest = { ...requestInput, participants, matchId, controlSecret, createdAt }
    await dependencies.beginMatchCreation({ matchId, gameKey: request.gameKey, seatAPlayerRef, seatBPlayerRef, createdAt })
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
        gameTitle: isRegisteredGameKey(record.gameKey) ? registry[record.gameKey].meta.title[locale] : record.gameKey,
        status: record.status === 'active' ? ('active' as const) : ('finished' as const),
        createdAt: record.createdAt,
        participants: {
          A: await dependencies.hydrateParticipant(record.participantRefs.A, locale),
          B: await dependencies.hydrateParticipant(record.participantRefs.B, locale),
        },
      })),
    )
  }

  async function readMatch(matchId: string, locale: SupportedLocale): Promise<ReadMatchResult> {
    const normalizedMatchId = normalizeMatchId(matchId)
    const record = await dependencies.getMatchRecord(normalizedMatchId)
    if (!record) return { ok: false, error: 'Unknown match', status: 404 }
    if (record.status === 'finalizing') await disposeAndFinishRoom(normalizedMatchId)
    if (record.status === 'finalizing' || record.status === 'finished') return await readArchivedMatch(record, locale)
    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }

    const roomResult = await dependencies.matchRoom.snapshot(normalizedMatchId)
    if (!roomResult.ok) {
      if (roomResult.error === 'Match is finalizing') {
        await archiveAndFinishRoom(normalizedMatchId)
        return await readArchivedMatch(record, locale)
      }
      const updatedRecord = await dependencies.getMatchRecord(normalizedMatchId)
      if (updatedRecord && updatedRecord.status !== 'active') {
        if (updatedRecord.status === 'finalizing') await disposeAndFinishRoom(normalizedMatchId)
        return await readArchivedMatch(updatedRecord, locale)
      }
      const status = roomResult.error === 'Unknown match' ? 404 : roomResult.status === 409 ? 409 : 502
      return { ok: false, error: roomResult.error, status }
    }

    const participants = await hydrateParticipants(record, locale)
    const result: Extract<ReadMatchResult, { ok: true }> = {
      ok: true,
      snapshot: roomResult.snapshot,
      participants,
    }
    if (roomResult.controlProjection !== undefined) result.controlProjection = roomResult.controlProjection
    if (roomResult.controlSections !== undefined) result.controlSections = roomResult.controlSections
    return result
  }

  async function commandMatch(matchId: string, commandId: CommandId, command: ControlCommand): Promise<CommandMatchResult> {
    const normalizedMatchId = normalizeMatchId(matchId)
    const record = await dependencies.getMatchRecord(normalizedMatchId)
    if (!record) return { ok: false, error: 'Unknown match', status: 404 }
    if (record.status === 'finalizing') await disposeAndFinishRoom(normalizedMatchId)
    if (record.status === 'finalizing' || record.status === 'finished') {
      return { ok: false, error: 'Match is finished', status: 409 }
    }
    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }
    const result = await dependencies.matchRoom.command(normalizedMatchId, commandId, command)
    if (result.ok && result.finalizing) await archiveAndFinishRoom(normalizedMatchId)
    if (!result.ok && result.error === 'match-locked') await archiveAndFinishRoom(normalizedMatchId)
    return result.ok ? { ok: true, accepted: result.accepted } : result
  }

  async function readMatchProtocol(
    matchId: string,
    timeZone: string,
    locale: SupportedLocale,
  ): Promise<ReadMatchProtocolResult> {
    const match = await readMatch(matchId, locale)
    if (!match.ok) return match
    const seatNames = { A: match.participants.A.displayName, B: match.participants.B.displayName }
    let protocolRows
    if (match.snapshot.status === 'active') {
      const facts = await dependencies.matchRoom.facts(match.snapshot.matchId)
      if (!facts.ok) {
        if (facts.error === 'Match is finalizing') {
          await archiveAndFinishRoom(match.snapshot.matchId)
          return await readMatchProtocol(match.snapshot.matchId, timeZone, locale)
        }
        return { ok: false, error: facts.error, status: facts.status }
      }
      protocolRows = deriveProtocolRows(facts.facts, seatNames, timeZone, locale).reverse()
    } else {
      const archive = await dependencies.getProtocolArchive(match.snapshot.matchId)
      if (!archive) return { ok: false, error: 'Missing protocol archive', status: 500 }
      if (archive.protocolVersion !== PROTOCOL_ARCHIVE_VERSION) {
        return { ok: false, error: 'Unsupported protocol archive version', status: 500 }
      }
      const rows = v.safeParse(ProtocolArchiveRowsJsonSchema, archive.rowsJson)
      if (!rows.success) return { ok: false, error: 'Failed to parse protocol archive from DB', status: 500 }
      protocolRows = renderProtocolRows(rows.output, seatNames, timeZone, locale)
    }
    return { ...match, protocolRows }
  }

  async function archiveAndFinishRoom(matchId: string): Promise<void> {
    const result = await dependencies.matchRoom.finalization(matchId)
    if (!result.ok) throw new Error(result.error)
    await dependencies.archiveCompletedMatch({ matchId, ...result.data })
    await disposeAndFinishRoom(matchId)
  }

  async function disposeAndFinishRoom(matchId: string): Promise<void> {
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

  async function readArchivedMatch(record: MatchRecord, locale: SupportedLocale): Promise<ReadMatchResult> {
    const archive = await dependencies.getProtocolArchive(record.matchId)
    if (!archive) return { ok: false, error: 'Missing completed match archive', status: 500 }
    const snapshot = v.safeParse(MatchSnapshotJsonSchema, archive.snapshotJson)
    if (!snapshot.success) return { ok: false, error: 'Failed to parse completed match snapshot', status: 500 }
    return { ok: true, snapshot: snapshot.output, participants: await hydrateParticipants(record, locale) }
  }

  return {
    createMatch,
    listMatches,
    readMatch,
    commandMatch,
    readMatchProtocol,
    streamMatchFacts: async (matchId, since) => {
      const normalizedMatchId = normalizeMatchId(matchId)
      const record = await dependencies.getMatchRecord(normalizedMatchId)
      if (!record) return Response.json({ ok: false, error: 'Unknown match' }, { status: 404 })
      if (record.status === 'finalizing') await disposeAndFinishRoom(normalizedMatchId)
      if (record.status === 'finalizing' || record.status === 'finished') {
        return Response.json({ ok: false, error: 'Match is finished' }, { status: 410 })
      }
      if (record.status !== 'active') return Response.json({ ok: false, error: 'Unknown match' }, { status: 404 })
      const response = await dependencies.matchRoom.stream(normalizedMatchId, since)
      if (response.status !== 409) return response
      await archiveAndFinishRoom(normalizedMatchId)
      return Response.json({ ok: false, error: 'Match is finished' }, { status: 410 })
    },
  }
}

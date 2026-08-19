import { normalizeMatchId, type CreateMatchRequest } from '@ks/competition'
import type { CommandId, ControlCommand, PlayerRef, StoredFact } from '@ks/core'
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
import type { MatchRoomClient, MatchRoomCreateRequest } from './match-room-client'
import { deriveProtocolRows, PROTOCOL_ARCHIVE_VERSION, ProtocolArchiveRowsSchema, renderProtocolRows } from './protocol'

type MatchListRecord = {
  matchId: string
  gameKey: string
  status: string
  createdAt: number
  participantRefs: { A: string; B: string }
}

type ApplicationDependencies = {
  newMatchId(): string
  newControlSecret(): string
  getOrCreateGuestPlayerRef(displayName: string): Promise<PlayerRef>
  hydrateParticipant(playerRef: string, locale: SupportedLocale): Promise<HydratedParticipant>
  listMatchRecords(): Promise<MatchListRecord[]>
  getMatchParticipantRefs(matchId: string): Promise<{ A: string; B: string } | null>
  listActiveFacts(matchId: string): Promise<StoredFact[]>
  getProtocolArchive(matchId: string): Promise<{ protocolVersion: number; rowsJson: string } | null>
  matchRoom: MatchRoomClient
}

const ProtocolArchiveRowsJsonSchema = v.pipe(v.string(), v.parseJson(), ProtocolArchiveRowsSchema)

export function createApplicationWithDependencies(dependencies: ApplicationDependencies): Application {
  async function createMatch(input: CreateMatchInput): Promise<CreateMatchResult> {
    const matchId = dependencies.newMatchId()
    const controlSecret = dependencies.newControlSecret()
    const { playerNames, ...requestInput } = input
    const [seatAPlayerRef, seatBPlayerRef] = await Promise.all([
      dependencies.getOrCreateGuestPlayerRef(playerNames.A),
      dependencies.getOrCreateGuestPlayerRef(playerNames.B),
    ])
    const participants: CreateMatchRequest['participants'] = [
      { seat: 'A', playerRef: seatAPlayerRef },
      { seat: 'B', playerRef: seatBPlayerRef },
    ]
    const request: MatchRoomCreateRequest = { ...requestInput, participants, matchId, controlSecret }
    return await dependencies.matchRoom.create(request)
  }

  async function listMatches(locale: SupportedLocale): Promise<MatchListEntry[]> {
    const records = await dependencies.listMatchRecords()
    return await Promise.all(
      records.map(async (record) => ({
        matchId: record.matchId,
        gameKey: record.gameKey,
        gameTitle: isRegisteredGameKey(record.gameKey) ? registry[record.gameKey].meta.title[locale] : record.gameKey,
        status: record.status === 'finished' ? ('finished' as const) : ('active' as const),
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
    const roomResult = await dependencies.matchRoom.snapshot(normalizedMatchId)
    if (!roomResult.ok) {
      const status = roomResult.error === 'Unknown match' ? 404 : roomResult.status === 409 ? 409 : 502
      return { ok: false, error: roomResult.error, status }
    }

    const participantRefs = await dependencies.getMatchParticipantRefs(normalizedMatchId)
    if (!participantRefs) return { ok: false, error: 'Unknown match', status: 404 }
    const participants = {
      A: await dependencies.hydrateParticipant(participantRefs.A, locale),
      B: await dependencies.hydrateParticipant(participantRefs.B, locale),
    }
    const result: Extract<ReadMatchResult, { ok: true }> = {
      ok: true,
      snapshot: roomResult.snapshot,
      participants,
    }
    if (roomResult.controlProjection !== undefined) result.controlProjection = roomResult.controlProjection
    if (roomResult.controlSections !== undefined) result.controlSections = roomResult.controlSections
    return result
  }

  async function commandMatch(
    matchId: string,
    controlSecret: string,
    commandId: CommandId,
    commands: ControlCommand[],
  ): Promise<CommandMatchResult> {
    const normalizedMatchId = normalizeMatchId(matchId)
    return await dependencies.matchRoom.command(normalizedMatchId, controlSecret, commandId, commands)
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
      protocolRows = deriveProtocolRows(
        await dependencies.listActiveFacts(match.snapshot.matchId),
        seatNames,
        timeZone,
        locale,
      ).reverse()
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

  return {
    createMatch,
    listMatches,
    readMatch,
    commandMatch,
    readMatchProtocol,
    streamMatchFacts: async (matchId, since) => await dependencies.matchRoom.stream(normalizeMatchId(matchId), since),
  }
}

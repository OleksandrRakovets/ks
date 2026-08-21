import { type CreateMatchRequest, type MatchSnapshotFor, normalizeMatchId } from '@ks/competition'
import {
  type CommandId,
  type ControlCommand,
  type ControlCommandSections,
  ControlCommandSectionsSchema,
  emptyControlCommandSections,
  type HydratedMatchParticipant,
  type MatchId,
  MatchSnapshotSchema,
  type PlayerRef,
  type UnixEpochMilliseconds,
} from '@ks/core'
import { type ControlProjectionFor, type RegisteredGameKey, registry } from '@ks/gameplay/definitions'
import { parseGameControl } from '@ks/gameplay/server'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

import type {
  Application,
  CommandMatchResult,
  CreateMatchInput,
  CreateMatchResult,
  HydratedMatchParticipants,
  MatchListEntry,
  ReadMatchControlResult,
  ReadMatchFailure,
  ReadMatchProtocolResult,
} from './contracts'
import { CreateMatchInputSchema } from './contracts'
import type { MatchRoomClient, MatchRoomCreateRequest, MatchRoomFinalizationData } from './match-room-client'
import {
  deriveProtocolRows,
  ProtocolArchiveCorruptionError,
  type ProtocolArchiveRecord,
  renderProtocolRows,
  UnsupportedProtocolArchiveVersionError,
} from './protocol'

type MatchListRecord = {
  matchId: MatchId
  gameKey: RegisteredGameKey
  status: string
  createdAt: UnixEpochMilliseconds
  participantRefs: { A: PlayerRef; B: PlayerRef }
}

type MatchRecord = {
  matchId: string
  gameKey: string
  status: string
  createdAt: UnixEpochMilliseconds
  participantRefs: { A: PlayerRef; B: PlayerRef }
}

type ApplicationDependencies = {
  newMatchId(): MatchId
  newControlSecret(): string
  now(): UnixEpochMilliseconds
  getOrCreateGuestPlayerRef(displayName: string): Promise<PlayerRef>
  hydrateParticipant(playerRef: PlayerRef, locale: SupportedLocale): Promise<HydratedMatchParticipant>
  listMatchRecords(): Promise<MatchListRecord[]>
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
  snapshot: MatchSnapshotFor<K>
  participants: HydratedMatchParticipants
  controlProjection?: ControlProjectionFor<K>
  controlSections?: ControlCommandSections
}
type ReadKeyedMatchResult<K extends RegisteredGameKey> = ReadKeyedMatchSuccess<K> | ReadMatchFailure

function expectsControlProjection(snapshot: v.InferOutput<typeof MatchSnapshotSchema>): boolean | null {
  const latestFrame = snapshot.frames.at(-1)
  if (!latestFrame) return snapshot.currentFrameIndex === 0 ? false : null
  if (latestFrame.frameIndex !== snapshot.currentFrameIndex) return null
  return snapshot.status === 'active' && latestFrame.winnerSeat === undefined
}

function isTerminalArchivedSnapshot(snapshot: v.InferOutput<typeof MatchSnapshotSchema>): boolean {
  if (snapshot.status !== 'finished') return false
  const latestFrame = snapshot.frames.at(-1)
  if (!latestFrame?.winnerSeat || latestFrame.frameIndex !== snapshot.currentFrameIndex) return false
  return (
    snapshot.framesWonBySeat.A >= snapshot.targets.matchTargetFrames ||
    snapshot.framesWonBySeat.B >= snapshot.targets.matchTargetFrames
  )
}

function validateRoomControlProjection<K extends RegisteredGameKey>(
  expectedGameKey: K,
  projection: ControlProjectionFor<RegisteredGameKey> | undefined,
): { ok: true; projection?: ControlProjectionFor<K> } | ReadMatchFailure {
  if (projection === undefined) return { ok: true }
  try {
    return { ok: true, projection: parseGameControl(expectedGameKey, projection) }
  } catch {
    return { ok: false, error: 'Invalid room control projection', status: 502 }
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
        if (record.status === 'finalizing') await disposeAndFinishRoom(normalizeMatchId(record.matchId))
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
    const normalizedMatchId = normalizeMatchId(matchId)
    const record = await dependencies.getMatchRecord(normalizedMatchId)
    if (!record || record.gameKey !== expectedGameKey) return { ok: false, error: 'Unknown match', status: 404 }
    if (record.status === 'finalizing') await disposeAndFinishRoom(normalizedMatchId)
    if (record.status === 'finalizing' || record.status === 'finished') {
      return await readArchivedMatch(record, locale, expectedGameKey)
    }
    if (record.status !== 'active') return { ok: false, error: 'Unknown match', status: 404 }

    const roomResult = await dependencies.matchRoom.snapshot(normalizedMatchId)
    if (!roomResult.ok) {
      if (roomResult.error === 'Match is finalizing') {
        await archiveAndFinishRoom(normalizedMatchId)
        return await readArchivedMatch(record, locale, expectedGameKey)
      }
      const updatedRecord = await dependencies.getMatchRecord(normalizedMatchId)
      if (updatedRecord && updatedRecord.status !== 'active') {
        if (updatedRecord.status === 'finalizing') await disposeAndFinishRoom(normalizedMatchId)
        if (updatedRecord.gameKey !== expectedGameKey) return { ok: false, error: 'Unknown match', status: 404 }
        return await readArchivedMatch(updatedRecord, locale, expectedGameKey)
      }
      const status = roomResult.error === 'Unknown match' ? 404 : roomResult.status === 409 ? 409 : 502
      return { ok: false, error: roomResult.error, status }
    }

    const snapshot = v.safeParse(MatchSnapshotSchema, roomResult.snapshot)
    if (!snapshot.success) return { ok: false, error: 'Invalid room snapshot', status: 502 }
    if (snapshot.output.gameKey !== expectedGameKey) return { ok: false, error: 'Unknown match', status: 404 }
    const controlSections = v.safeParse(ControlCommandSectionsSchema, roomResult.controlSections)
    if (!controlSections.success) return { ok: false, error: 'Invalid room control sections', status: 502 }
    const validatedProjection = validateRoomControlProjection(expectedGameKey, roomResult.controlProjection)
    if (!validatedProjection.ok) return validatedProjection
    const projectionExpected = expectsControlProjection(snapshot.output)
    if (projectionExpected === null || projectionExpected !== (validatedProjection.projection !== undefined)) {
      return { ok: false, error: 'Inconsistent room control lifecycle', status: 502 }
    }
    const result: ReadKeyedMatchSuccess<K> = {
      ok: true,
      snapshot: { ...snapshot.output, gameKey: expectedGameKey },
      participants: await hydrateParticipants(record, locale),
      controlSections: controlSections.output,
    }
    if (validatedProjection.projection !== undefined) result.controlProjection = validatedProjection.projection
    return result
  }

  async function readMatchControl<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchControlResult<K>> {
    const match = await readKeyedMatch(matchId, locale, expectedGameKey)
    if (!match.ok) return match
    const controlSections = match.controlSections ?? emptyControlCommandSections()
    return match.controlProjection
      ? { ...match, state: 'frame-active', controlProjection: match.controlProjection, controlSections }
      : { ...match, state: 'between-frames', controlSections }
  }

  async function commandMatch<K extends RegisteredGameKey>(
    matchId: string,
    commandId: CommandId,
    command: ControlCommand,
    expectedGameKey: K,
  ): Promise<CommandMatchResult> {
    const normalizedMatchId = normalizeMatchId(matchId)
    const record = await dependencies.getMatchRecord(normalizedMatchId)
    if (!record || record.gameKey !== expectedGameKey) return { ok: false, error: 'Unknown match', status: 404 }
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

  async function readMatchProtocol<K extends RegisteredGameKey>(
    matchId: MatchId,
    timeZone: string,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>> {
    const match = await readKeyedMatch(matchId, locale, expectedGameKey)
    if (!match.ok) return match
    const seatNames = { A: match.participants.A.displayName, B: match.participants.B.displayName }
    let protocolRows
    if (match.snapshot.status === 'active') {
      const facts = await dependencies.matchRoom.facts(match.snapshot.matchId)
      if (!facts.ok) {
        if (facts.error === 'Match is finalizing') {
          await archiveAndFinishRoom(match.snapshot.matchId)
          return await readMatchProtocol(match.snapshot.matchId, timeZone, locale, expectedGameKey)
        }
        return { ok: false, error: facts.error, status: facts.status }
      }
      protocolRows = deriveProtocolRows(facts.facts, seatNames, timeZone, locale).reverse()
    } else {
      let archive: ProtocolArchiveRecord | null
      try {
        archive = await dependencies.getProtocolArchive(match.snapshot.matchId)
      } catch (error) {
        const failure = error instanceof Error ? archiveReadFailure(error) : null
        if (failure) return failure
        throw error
      }
      if (!archive) return { ok: false, error: 'Missing protocol archive', status: 500 }
      protocolRows = renderProtocolRows(archive.rows, seatNames, timeZone, locale)
    }
    const result: Extract<ReadMatchProtocolResult<K>, { ok: true }> = {
      ok: true,
      snapshot: match.snapshot,
      participants: match.participants,
      protocolRows,
    }
    if (match.controlProjection) result.controlProjection = match.controlProjection
    return result
  }

  async function archiveAndFinishRoom(matchId: MatchId): Promise<void> {
    const result = await dependencies.matchRoom.finalization(matchId)
    if (!result.ok) throw new Error(result.error)
    await dependencies.archiveCompletedMatch({ matchId, ...result.data })
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
      archive = await dependencies.getProtocolArchive(normalizeMatchId(record.matchId))
    } catch (error) {
      const failure = error instanceof Error ? archiveReadFailure(error) : null
      if (failure) return failure
      throw error
    }
    if (!archive) return { ok: false, error: 'Missing completed match archive', status: 500 }
    const snapshot = archive.snapshot
    if (snapshot.gameKey !== expectedGameKey) return { ok: false, error: 'Unknown match', status: 404 }
    if (!isTerminalArchivedSnapshot(snapshot)) {
      return { ok: false, error: 'Failed to parse completed match snapshot', status: 500 }
    }
    return {
      ok: true,
      snapshot: { ...snapshot, gameKey: expectedGameKey },
      participants: await hydrateParticipants(record, locale),
    }
  }

  return {
    createMatch,
    listMatches,
    readMatchControl,
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

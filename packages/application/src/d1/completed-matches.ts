import { restoreSparringMatchSession, SparringMatchReplayError, type SparringMatchRoomProjection } from '@ks/competition'
import type { MatchId, MatchSnapshot, StoredMatchFact, UnixEpochMilliseconds } from '@ks/core'
import { and, eq, inArray } from 'drizzle-orm'

import { prepareProtocolRowsForArchive, PROTOCOL_ARCHIVE_VERSION } from '../protocol'
import { matches, matchProtocolArchives, StoredMatchStatus } from './schema'
import type { ApplicationDatabase } from './types'

export type CompletedMatchArchiveInput = {
  matchId: MatchId
  sourceLatestSeq: number
  endedAt: UnixEpochMilliseconds
  facts: StoredMatchFact[]
  projection: SparringMatchRoomProjection
}

export class CompletedMatchArchiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompletedMatchArchiveError'
  }
}

type ArchiveRecord = {
  matchId: MatchId
  sourceLatestSeq: number
  protocolVersion: number
  rowsJson: string
  snapshotJson: string
  createdAt: UnixEpochMilliseconds
}

type StoredMatchRow = {
  status: string
  endedAt: UnixEpochMilliseconds | null
}

function projectionsEqual(left: SparringMatchRoomProjection, right: SparringMatchRoomProjection): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function requireNonemptyFacts(facts: StoredMatchFact[]): [StoredMatchFact, ...StoredMatchFact[]] {
  const [first, ...rest] = facts
  if (!first) {
    throw new CompletedMatchArchiveError('Completed match archive requires a non-empty fact journal')
  }
  return [first, ...rest]
}

function archivesEqual(left: ArchiveRecord, right: ArchiveRecord): boolean {
  return (
    left.matchId === right.matchId &&
    left.sourceLatestSeq === right.sourceLatestSeq &&
    left.protocolVersion === right.protocolVersion &&
    left.rowsJson === right.rowsJson &&
    left.snapshotJson === right.snapshotJson &&
    left.createdAt === right.createdAt
  )
}

function catalogMatchesArchive(storedMatch: StoredMatchRow, endedAt: UnixEpochMilliseconds): boolean {
  return (
    (storedMatch.status === StoredMatchStatus.finalizing || storedMatch.status === StoredMatchStatus.finished) &&
    storedMatch.endedAt === endedAt
  )
}

function validateTerminalArchive(input: CompletedMatchArchiveInput): MatchSnapshot {
  const { facts, matchId, sourceLatestSeq, projection: suppliedProjection } = input
  const orderedFacts = requireNonemptyFacts(facts)

  const [firstFact] = orderedFacts
  if (firstFact?.type !== 'match.created') {
    throw new CompletedMatchArchiveError('Completed match archive must begin with match.created')
  }

  const terminalFact = facts.at(-1)
  if (terminalFact?.type !== 'match.ended') {
    throw new CompletedMatchArchiveError('Completed match archive must end with match.ended')
  }

  if (firstFact.payload.matchId !== matchId) {
    throw new CompletedMatchArchiveError('Completed match archive match ID does not match creation fact')
  }

  if (terminalFact.seq !== sourceLatestSeq) {
    throw new CompletedMatchArchiveError('Completed match archive source sequence does not match terminal fact')
  }

  for (const fact of facts) {
    if (fact.matchId !== matchId) {
      throw new CompletedMatchArchiveError('Completed match archive contains a fact for a different match')
    }
  }

  let session
  try {
    session = restoreSparringMatchSession(orderedFacts)
  } catch (error) {
    if (error instanceof SparringMatchReplayError) {
      throw new CompletedMatchArchiveError(`Completed match archive replay failed: ${error.message}`)
    }
    throw error
  }

  try {
    if (session.state.phase !== 'match-over') {
      throw new CompletedMatchArchiveError('Completed match archive replay is not terminal')
    }

    const replayProjection = session.project(sourceLatestSeq)
    if (replayProjection.snapshot.status !== 'finished') {
      throw new CompletedMatchArchiveError('Completed match archive replay snapshot is not finished')
    }
    if (replayProjection.snapshot.matchId !== matchId) {
      throw new CompletedMatchArchiveError('Completed match archive replay snapshot match ID mismatch')
    }
    if (replayProjection.snapshot.latestSeq !== sourceLatestSeq) {
      throw new CompletedMatchArchiveError('Completed match archive replay snapshot sequence mismatch')
    }
    if (!projectionsEqual(replayProjection, suppliedProjection)) {
      throw new CompletedMatchArchiveError('Completed match archive terminal projection does not match replay')
    }

    return replayProjection.snapshot
  } catch (error) {
    if (error instanceof SparringMatchReplayError) {
      throw new CompletedMatchArchiveError(`Completed match archive replay failed: ${error.message}`)
    }
    throw error
  } finally {
    session.dispose()
  }
}

export async function archiveCompletedMatch(db: ApplicationDatabase, input: CompletedMatchArchiveInput): Promise<void> {
  const snapshot = validateTerminalArchive(input)
  const archive: ArchiveRecord = {
    matchId: input.matchId,
    sourceLatestSeq: input.sourceLatestSeq,
    protocolVersion: PROTOCOL_ARCHIVE_VERSION,
    rowsJson: JSON.stringify(prepareProtocolRowsForArchive(requireNonemptyFacts(input.facts))),
    snapshotJson: JSON.stringify(snapshot),
    createdAt: input.endedAt,
  }

  const [storedArchive, storedMatch] = await Promise.all([
    db.select().from(matchProtocolArchives).where(eq(matchProtocolArchives.matchId, input.matchId)).get(),
    db
      .select({ status: matches.status, endedAt: matches.endedAt })
      .from(matches)
      .where(eq(matches.matchId, input.matchId))
      .get(),
  ])

  if (storedArchive && !archivesEqual(storedArchive, archive)) {
    throw new CompletedMatchArchiveError('Completed match archive conflicts with existing data')
  }

  if (storedArchive && archivesEqual(storedArchive, archive)) {
    if (!storedMatch || !catalogMatchesArchive(storedMatch, input.endedAt)) {
      throw new CompletedMatchArchiveError('Completed match archive conflicts with existing data')
    }
    return
  }

  if (
    !storedMatch ||
    (storedMatch.status !== StoredMatchStatus.active && storedMatch.status !== StoredMatchStatus.finalizing)
  ) {
    throw new CompletedMatchArchiveError('Completed match is not ready to archive')
  }

  await db.batch([
    db.insert(matchProtocolArchives).values(archive).onConflictDoNothing({ target: matchProtocolArchives.matchId }),
    db
      .update(matches)
      .set({ status: StoredMatchStatus.finalizing, endedAt: input.endedAt })
      .where(
        and(
          eq(matches.matchId, input.matchId),
          inArray(matches.status, [StoredMatchStatus.active, StoredMatchStatus.finalizing]),
        ),
      ),
  ])

  const [writtenArchive, writtenMatch] = await Promise.all([
    db.select().from(matchProtocolArchives).where(eq(matchProtocolArchives.matchId, input.matchId)).get(),
    db
      .select({ status: matches.status, endedAt: matches.endedAt })
      .from(matches)
      .where(eq(matches.matchId, input.matchId))
      .get(),
  ])

  if (
    !writtenArchive ||
    !archivesEqual(writtenArchive, archive) ||
    !writtenMatch ||
    !catalogMatchesArchive(writtenMatch, input.endedAt)
  ) {
    throw new CompletedMatchArchiveError('Completed match archive conflicts with existing data')
  }
}

export async function finishCompletedMatch(db: ApplicationDatabase, matchId: MatchId): Promise<void> {
  const result = await db
    .update(matches)
    .set({ status: StoredMatchStatus.finished })
    .where(
      and(eq(matches.matchId, matchId), inArray(matches.status, [StoredMatchStatus.finalizing, StoredMatchStatus.finished])),
    )
    .returning({ status: matches.status })
  if (result.length !== 1 || result[0]?.status !== StoredMatchStatus.finished) {
    throw new CompletedMatchArchiveError('Completed match is not ready to finish')
  }
}

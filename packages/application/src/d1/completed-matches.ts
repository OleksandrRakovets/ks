import { restoreSparringMatch, SparringMatchHistoryError, type SparringMatchRoomProjection } from '@ks/competition'
import {
  type MatchFactContentBatch,
  type MatchFactContentHistory,
  MatchFactContentSchema,
  type MatchId,
  type MatchState,
  type StoredMatchFact,
  type UnixEpochMilliseconds,
} from '@ks/core'
import { and, eq, inArray } from 'drizzle-orm'
import * as v from 'valibot'

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
  stateJson: string
  createdAt: UnixEpochMilliseconds
}

type StoredMatchRow = {
  status: string
  endedAt: UnixEpochMilliseconds | null
}

function projectionsEqual(left: SparringMatchRoomProjection, right: SparringMatchRoomProjection): boolean {
  // SAFETY: projections are typed semantic values; embedded control command dictionaries contain validated JSON values.
  const leftProjection = left as StructuralValue
  // SAFETY: projections are typed semantic values; embedded control command dictionaries contain validated JSON values.
  const rightProjection = right as StructuralValue
  return structuralEqual(leftProjection, rightProjection)
}

type StructuralValue = undefined | null | boolean | number | string | readonly StructuralValue[] | StructuralObject
type StructuralObject = { readonly [key: string]: StructuralValue }

function structuralEqual(left: StructuralValue, right: StructuralValue): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || Object(left) !== left || Object(right) !== right) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structuralEqual(value, right[index]))
    )
  }
  // SAFETY: null, primitive, and array values were excluded above, leaving structural objects.
  const leftRecord = left as StructuralObject
  // SAFETY: null, primitive, and array values were excluded above, leaving structural objects.
  const rightRecord = right as StructuralObject
  const keys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined)
  const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined)
  return (
    keys.length === rightKeys.length &&
    keys.every((key) => Object.hasOwn(rightRecord, key) && structuralEqual(leftRecord[key], rightRecord[key]))
  )
}

function requireNonemptyFacts(facts: StoredMatchFact[]): [StoredMatchFact, ...StoredMatchFact[]] {
  const [first, ...rest] = facts
  if (!first) {
    throw new CompletedMatchArchiveError('Completed match archive requires a non-empty fact journal')
  }
  return [first, ...rest]
}

function validateAndGroupJournal(
  facts: [StoredMatchFact, ...StoredMatchFact[]],
  matchId: MatchId,
  latestSeq: number,
): MatchFactContentHistory {
  const batches: MatchFactContentBatch[] = []
  const seen = new Set<string>()
  let commandId: string | null = null
  let acceptedAt: number | null = null
  for (let index = 0; index < facts.length; index += 1) {
    const fact = facts[index]!
    const content = v.parse(MatchFactContentSchema, { type: fact.type, payload: fact.payload })
    if (fact.seq !== index + 1 || fact.matchId !== matchId)
      throw new CompletedMatchArchiveError('Completed match archive journal envelope is invalid')
    if (index === 0) {
      if (fact.type !== 'match.created' || fact.causedByCommandId !== null)
        throw new CompletedMatchArchiveError('Completed match archive must begin with singleton match.created')
      batches.push([content])
      continue
    }
    if (fact.type === 'match.created' || fact.causedByCommandId === null)
      throw new CompletedMatchArchiveError('Completed match archive command causation is invalid')
    if (fact.causedByCommandId !== commandId) {
      if (seen.has(fact.causedByCommandId))
        throw new CompletedMatchArchiveError('Completed match archive command causation recurs')
      seen.add(fact.causedByCommandId)
      batches.push([content])
      commandId = fact.causedByCommandId
      acceptedAt = fact.acceptedAt
    } else if (fact.acceptedAt !== acceptedAt)
      throw new CompletedMatchArchiveError('Completed match archive batch timestamp differs')
    else {
      const current = batches.at(-1)
      if (!current) throw new CompletedMatchArchiveError('Completed match archive command batch is missing')
      batches[batches.length - 1] = [...current, content]
    }
    if (fact.type === 'match.ended' && index !== facts.length - 1)
      throw new CompletedMatchArchiveError('Completed match archive has facts after terminal state')
  }
  if (facts.at(-1)?.seq !== latestSeq)
    throw new CompletedMatchArchiveError('Completed match archive source sequence does not match journal tail')
  const [first, ...rest] = batches
  if (!first) throw new CompletedMatchArchiveError('Completed match archive has no semantic batches')
  return [first, ...rest]
}

function archivesEqual(left: ArchiveRecord, right: ArchiveRecord): boolean {
  return (
    left.matchId === right.matchId &&
    left.sourceLatestSeq === right.sourceLatestSeq &&
    left.protocolVersion === right.protocolVersion &&
    left.rowsJson === right.rowsJson &&
    left.stateJson === right.stateJson &&
    left.createdAt === right.createdAt
  )
}

function catalogMatchesArchive(storedMatch: StoredMatchRow, endedAt: UnixEpochMilliseconds): boolean {
  return (
    (storedMatch.status === StoredMatchStatus.finalizing || storedMatch.status === StoredMatchStatus.finished) &&
    storedMatch.endedAt === endedAt
  )
}

function validateTerminalArchive(input: CompletedMatchArchiveInput): MatchState {
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
    session = restoreSparringMatch(validateAndGroupJournal(orderedFacts, matchId, sourceLatestSeq))
  } catch (error) {
    if (error instanceof SparringMatchHistoryError) {
      throw new CompletedMatchArchiveError(`Completed match archive replay failed: ${error.message}`)
    }
    throw error
  }

  try {
    const replayProjection = session.project()
    if (replayProjection.state.status !== 'finished') {
      throw new CompletedMatchArchiveError('Completed match archive replay state is not finished')
    }
    if (replayProjection.state.matchId !== matchId) {
      throw new CompletedMatchArchiveError('Completed match archive replay state match ID mismatch')
    }
    if (!projectionsEqual(replayProjection, suppliedProjection)) {
      throw new CompletedMatchArchiveError('Completed match archive terminal projection does not match replay')
    }

    return replayProjection.state
  } catch (error) {
    if (error instanceof SparringMatchHistoryError) {
      throw new CompletedMatchArchiveError(`Completed match archive replay failed: ${error.message}`)
    }
    throw error
  } finally {
    session.dispose()
  }
}

export async function archiveCompletedMatch(db: ApplicationDatabase, input: CompletedMatchArchiveInput): Promise<void> {
  const terminal = input.facts.at(-1)
  if (terminal?.type !== 'match.ended' || terminal.acceptedAt !== input.endedAt) {
    throw new CompletedMatchArchiveError('Completed match archive endedAt does not match terminal acceptance')
  }
  const state = validateTerminalArchive(input)
  const archive: ArchiveRecord = {
    matchId: input.matchId,
    sourceLatestSeq: input.sourceLatestSeq,
    protocolVersion: PROTOCOL_ARCHIVE_VERSION,
    rowsJson: JSON.stringify(prepareProtocolRowsForArchive(requireNonemptyFacts(input.facts))),
    stateJson: JSON.stringify(state),
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

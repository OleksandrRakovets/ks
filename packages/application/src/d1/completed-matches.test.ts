import { describe, expect, test } from 'bun:test'

import {
  buildMatchConfig,
  CreateMatchRequestSchema,
  createSparringMatchSession,
  draftSparringMatchCreation,
  restoreSparringMatchSession,
  type SparringMatchCommand,
  type SparringMatchRoomProjection,
  type SparringMatchSession,
} from '@ks/competition'
import {
  type CommandId,
  type MatchConfig,
  type MatchFactDraft,
  MatchIdSchema,
  newCommandId,
  newFactId,
  newMatchId,
  type StoredMatchFact,
  StoredMatchFactSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import * as v from 'valibot'

import { prepareProtocolRowsForArchive } from '../protocol'
import { archiveCompletedMatch, CompletedMatchArchiveError, type CompletedMatchArchiveInput } from './completed-matches'
import { matches, matchProtocolArchives, StoredMatchStatus } from './schema'
import type { ApplicationDatabase } from './types'

const createRequest = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: {
    frameTargetPointsBySeat: { A: 2, B: 2 },
    matchTargetFrames: 1,
  },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: 'gp_01HX0000000000000000000000' },
    { seat: 'B', playerRef: 'gp_01HX0000000000000000000001' },
  ],
})

function makeConfig(): MatchConfig {
  return buildMatchConfig(newMatchId(), createRequest)
}

function toStored(
  draft: MatchFactDraft,
  config: MatchConfig,
  seq: number,
  commandId: CommandId,
  occurredAt: number,
): StoredMatchFact {
  const envelope = {
    factId: newFactId(),
    matchId: config.matchId,
    occurredAt,
    receivedAt: occurredAt + 1,
    seq,
    type: draft.type,
    payload: draft.payload,
  }
  return v.parse(StoredMatchFactSchema, {
    ...envelope,
    causedByCommandId: draft.type === 'match.created' ? null : commandId,
  })
}

function nonemptyStoredFacts(facts: StoredMatchFact[]): [StoredMatchFact, ...StoredMatchFact[]] {
  const [first, ...rest] = facts
  if (!first) throw new Error('Expected at least one stored fact')
  return [first, ...rest]
}

function acceptWarm(
  session: SparringMatchSession,
  command: SparringMatchCommand,
  seq: number,
  commandId: CommandId,
  occurredAt: number,
): StoredMatchFact[] {
  const decision = session.decide(command)
  if (decision._tag !== 'accepted') throw new Error(`Expected accepted decision for ${command.type}`)
  const facts = nonemptyStoredFacts(
    decision.facts.map((draft, index) => toStored(draft, session.state.config, seq + index, commandId, occurredAt)),
  )
  session.applyCommitted(decision.transition, facts)
  return [...facts]
}

function buildValidTerminalJournal(config = makeConfig()): [StoredMatchFact, ...StoredMatchFact[]] {
  const session = createSparringMatchSession(config)
  const occurredAt = 1000
  let seq = 1
  const journal: StoredMatchFact[] = [toStored(draftSparringMatchCreation(config), config, seq++, newCommandId(), occurredAt)]
  try {
    for (const command of [
      { type: 'frame.start' },
      { type: 'frame.commence', seat: 'A' as const },
      { type: 'game.command', gameKey: 'free-pyramid', command: { type: 'pot.record', seat: 'A' as const, points: 2 } },
      { type: 'game.command', gameKey: 'free-pyramid', command: { type: 'frame.award', seat: 'A' as const } },
    ] satisfies SparringMatchCommand[]) {
      journal.push(...acceptWarm(session, command, seq, newCommandId(), occurredAt))
      seq = journal.at(-1)!.seq + 1
    }
    return nonemptyStoredFacts(journal)
  } finally {
    session.dispose()
  }
}

function terminalProjection(facts: [StoredMatchFact, ...StoredMatchFact[]]): SparringMatchRoomProjection {
  const session = restoreSparringMatchSession(facts)
  try {
    return session.project(facts.at(-1)!.seq)
  } finally {
    session.dispose()
  }
}

function validArchiveInput(config = makeConfig()): CompletedMatchArchiveInput {
  const facts = buildValidTerminalJournal(config)
  const endedAt = v.parse(UnixEpochMillisecondsSchema, facts.at(-1)!.receivedAt)
  return {
    matchId: config.matchId,
    sourceLatestSeq: facts.at(-1)!.seq,
    endedAt,
    facts: [...facts],
    projection: terminalProjection(facts),
  }
}

type ArchiveRow = {
  matchId: string
  sourceLatestSeq: number
  protocolVersion: number
  rowsJson: string
  snapshotJson: string
  createdAt: number
}

type MatchRow = {
  status: string
  endedAt: number | null
}

function createArchiveDatabase(initial?: { archive?: ArchiveRow; match?: MatchRow & { matchId: string } }) {
  let archiveRow = initial?.archive ?? null
  let matchRow = initial?.match ?? null
  let batchCalls = 0
  let pendingArchive: ArchiveRow | null = null
  let pendingMatchUpdate: Partial<MatchRow> | null = null

  const db: ApplicationDatabase = Object.create(null)
  Object.defineProperty(db, 'batch', {
    value: async (statements: unknown[]) => {
      batchCalls += 1
      if (statements.length !== 2) throw new Error('Expected archive batch of two statements')
      if (pendingArchive && archiveRow === null) archiveRow = pendingArchive
      if (matchRow && pendingMatchUpdate) matchRow = { ...matchRow, ...pendingMatchUpdate }
      return statements
    },
  })
  Object.defineProperty(db, 'insert', {
    value: () => ({
      values: (row: ArchiveRow) => ({
        onConflictDoNothing: () => {
          pendingArchive = row
          return { row }
        },
      }),
    }),
  })
  Object.defineProperty(db, 'update', {
    value: () => ({
      set: (values: Partial<MatchRow>) => {
        pendingMatchUpdate = values
        return {
          where: () => ({
            returning: () => {
              if (matchRow) matchRow = { ...matchRow, ...values }
              return [{ status: matchRow?.status }]
            },
          }),
        }
      },
    }),
  })
  Object.defineProperty(db, 'select', {
    value: () => ({
      from: (table: typeof matchProtocolArchives | typeof matches) => ({
        where: () => ({
          get: async () => {
            if (table === matchProtocolArchives) return archiveRow
            if (table === matches) return matchRow
            return null
          },
        }),
      }),
    }),
  })

  return {
    db,
    get batchCalls() {
      return batchCalls
    },
    get matchRow() {
      return matchRow ? { ...matchRow } : null
    },
    get archiveRow() {
      return archiveRow ? { ...archiveRow } : null
    },
    setArchiveRow(row: ArchiveRow) {
      archiveRow = row
    },
  }
}

describe('completed match archive', () => {
  test('archives a valid terminal journal with replay-verified snapshot', async () => {
    const input = validArchiveInput()
    const archiveDb = createArchiveDatabase({
      match: { matchId: input.matchId, status: StoredMatchStatus.active, endedAt: null },
    })
    await archiveCompletedMatch(archiveDb.db, input)
    expect(archiveDb.batchCalls).toBe(1)
  })

  test('rejects empty journals', async () => {
    const config = makeConfig()
    const terminal = buildValidTerminalJournal(config)
    const archiveDb = createArchiveDatabase()
    await expect(
      archiveCompletedMatch(archiveDb.db, {
        matchId: config.matchId,
        sourceLatestSeq: 1,
        endedAt: terminal.at(-1)!.receivedAt,
        facts: [],
        projection: terminalProjection(terminal),
      }),
    ).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb.batchCalls).toBe(0)
  })

  test('rejects non-terminal journals', async () => {
    const config = makeConfig()
    const session = createSparringMatchSession(config)
    const facts = [toStored(draftSparringMatchCreation(config), config, 1, newCommandId(), 1000)]
    try {
      facts.push(...acceptWarm(session, { type: 'frame.start' }, 2, newCommandId(), 1000))
    } finally {
      session.dispose()
    }
    const archiveDb = createArchiveDatabase()
    await expect(
      archiveCompletedMatch(archiveDb.db, {
        matchId: config.matchId,
        sourceLatestSeq: facts.at(-1)!.seq,
        endedAt: facts.at(-1)!.receivedAt,
        facts,
        projection: terminalProjection(buildValidTerminalJournal(config)),
      }),
    ).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb.batchCalls).toBe(0)
  })

  test('rejects journals whose first fact is not match.created', async () => {
    const input = validArchiveInput()
    const [, ...restFacts] = input.facts
    const badFacts = [restFacts[0]!, ...restFacts]
    const archiveDb = createArchiveDatabase()
    await expect(
      archiveCompletedMatch(archiveDb.db, {
        ...input,
        facts: badFacts,
      }),
    ).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb.batchCalls).toBe(0)
  })

  test('rejects match ID and source sequence mismatches', async () => {
    const input = validArchiveInput()
    const archiveDb = createArchiveDatabase()
    await expect(
      archiveCompletedMatch(archiveDb.db, {
        ...input,
        matchId: v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV'),
      }),
    ).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb.batchCalls).toBe(0)

    const archiveDb2 = createArchiveDatabase()
    await expect(
      archiveCompletedMatch(archiveDb2.db, {
        ...input,
        sourceLatestSeq: input.sourceLatestSeq + 1,
      }),
    ).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb2.batchCalls).toBe(0)
  })

  test('rejects terminal projection mismatch', async () => {
    const input = validArchiveInput()
    const mismatched = terminalProjection(buildValidTerminalJournal(makeConfig()))
    const archiveDb = createArchiveDatabase()
    await expect(
      archiveCompletedMatch(archiveDb.db, {
        ...input,
        projection: mismatched,
      }),
    ).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb.batchCalls).toBe(0)
  })

  test('aborts without partial writes when replay fails', async () => {
    const input = validArchiveInput()
    const corrupted = [...input.facts]
    const gameCommand = corrupted.find((fact) => fact.type === 'game.command')
    if (!gameCommand || gameCommand.type !== 'game.command') throw new Error('expected game.command')
    corrupted[corrupted.indexOf(gameCommand)] = {
      ...gameCommand,
      payload: {
        ...gameCommand.payload,
        command: { seat: 'B', points: 99 },
      },
    }
    const archiveDb = createArchiveDatabase()
    await expect(
      archiveCompletedMatch(archiveDb.db, {
        ...input,
        facts: corrupted,
      }),
    ).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb.batchCalls).toBe(0)
  })

  test('accepts idempotent identical archive writes', async () => {
    const input = validArchiveInput()
    const rowsJson = JSON.stringify(prepareProtocolRowsForArchive(nonemptyStoredFacts([...input.facts])))
    const snapshotJson = JSON.stringify(input.projection.snapshot)
    const archiveDb = createArchiveDatabase({
      archive: {
        matchId: input.matchId,
        sourceLatestSeq: input.sourceLatestSeq,
        protocolVersion: 1,
        rowsJson,
        snapshotJson,
        createdAt: input.endedAt,
      },
      match: { matchId: input.matchId, status: StoredMatchStatus.finalizing, endedAt: input.endedAt },
    })
    await archiveCompletedMatch(archiveDb.db, input)
    expect(archiveDb.batchCalls).toBe(0)
  })

  test('rejects conflicting archive data without mutating an active catalog row', async () => {
    const input = validArchiveInput()
    const initialMatch = { matchId: input.matchId, status: StoredMatchStatus.active, endedAt: null }
    const archiveDb = createArchiveDatabase({
      archive: {
        matchId: input.matchId,
        sourceLatestSeq: input.sourceLatestSeq,
        protocolVersion: 1,
        rowsJson: '[]',
        snapshotJson: '{}',
        createdAt: input.endedAt,
      },
      match: initialMatch,
    })
    await expect(archiveCompletedMatch(archiveDb.db, input)).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb.batchCalls).toBe(0)
    expect(archiveDb.matchRow).toEqual(initialMatch)
    expect(archiveDb.archiveRow?.snapshotJson).toBe('{}')
  })
})

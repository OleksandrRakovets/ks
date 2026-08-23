import { describe, expect, test } from 'bun:test'

import {
  buildMatchConfig,
  CreateMatchRequestSchema,
  draftSparringMatchCreation,
  restoreSparringMatch,
  type SparringMatch,
  type SparringMatchRoomProjection,
} from '@ks/competition'
import {
  type CommandId,
  type ControlCommand,
  type MatchConfig,
  type MatchFactContent,
  MatchFactContentSchema,
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
  draft: MatchFactContent,
  config: MatchConfig,
  seq: number,
  commandId: CommandId,
  acceptedAt: number,
): StoredMatchFact {
  const envelope = {
    factId: newFactId(),
    matchId: config.matchId,
    acceptedAt,
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
  session: SparringMatch,
  config: MatchConfig,
  command: ControlCommand,
  seq: number,
  commandId: CommandId,
  acceptedAt: number,
): StoredMatchFact[] {
  const decision = session.execute(command)
  if (decision._tag !== 'accepted') throw new Error(`Expected accepted decision for ${command.commandType}`)
  const facts = nonemptyStoredFacts(
    decision.facts.map((draft, index) => toStored(draft, config, seq + index, commandId, acceptedAt)),
  )
  return [...facts]
}

function buildValidTerminalJournal(config = makeConfig()): [StoredMatchFact, ...StoredMatchFact[]] {
  const creation = draftSparringMatchCreation(config)
  const session = restoreSparringMatch([[creation]])
  const acceptedAt = 1000
  let seq = 1
  const journal: StoredMatchFact[] = [toStored(creation, config, seq++, newCommandId(), acceptedAt)]
  try {
    for (const command of [
      { source: 'match', commandType: 'frame.start', command: {} },
      { source: 'match', commandType: 'frame.commence', command: { seat: 'A' } },
      { source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 2 } },
      { source: 'game', commandType: 'frame.award', command: { seat: 'A' } },
    ] satisfies ControlCommand[]) {
      journal.push(...acceptWarm(session, config, command, seq, newCommandId(), acceptedAt))
      seq = journal.at(-1)!.seq + 1
    }
    return nonemptyStoredFacts(journal)
  } finally {
    session.dispose()
  }
}

function terminalProjection(facts: [StoredMatchFact, ...StoredMatchFact[]]): SparringMatchRoomProjection {
  const batches = facts.reduce<MatchFactContent[][]>((result, fact) => {
    const content = v.parse(MatchFactContentSchema, { type: fact.type, payload: fact.payload })
    if (
      fact.type === 'match.created' ||
      result.length === 0 ||
      facts[facts.indexOf(fact) - 1]?.causedByCommandId !== fact.causedByCommandId
    )
      result.push([content])
    else result.at(-1)!.push(content)
    return result
  }, [])
  const grouped: unknown = batches
  // SAFETY: this fixture groups the non-empty journal by contiguous command causation.
  const session = restoreSparringMatch(grouped as Parameters<typeof restoreSparringMatch>[0])
  try {
    return session.project()
  } finally {
    session.dispose()
  }
}

function validArchiveInput(config = makeConfig()): CompletedMatchArchiveInput {
  const facts = buildValidTerminalJournal(config)
  const endedAt = v.parse(UnixEpochMillisecondsSchema, facts.at(-1)!.acceptedAt)
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
  stateJson: string
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
        endedAt: terminal.at(-1)!.acceptedAt,
        facts: [],
        projection: terminalProjection(terminal),
      }),
    ).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb.batchCalls).toBe(0)
  })

  test('rejects non-terminal journals', async () => {
    const config = makeConfig()
    const creation = draftSparringMatchCreation(config)
    const session = restoreSparringMatch([[creation]])
    const facts = [toStored(creation, config, 1, newCommandId(), 1000)]
    try {
      facts.push(
        ...acceptWarm(session, config, { source: 'match', commandType: 'frame.start', command: {} }, 2, newCommandId(), 1000),
      )
    } finally {
      session.dispose()
    }
    const archiveDb = createArchiveDatabase()
    await expect(
      archiveCompletedMatch(archiveDb.db, {
        matchId: config.matchId,
        sourceLatestSeq: facts.at(-1)!.seq,
        endedAt: facts.at(-1)!.acceptedAt,
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
    const stateJson = JSON.stringify(input.projection.state)
    const archiveDb = createArchiveDatabase({
      archive: {
        matchId: input.matchId,
        sourceLatestSeq: input.sourceLatestSeq,
        protocolVersion: 1,
        rowsJson,
        stateJson,
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
        stateJson: '{}',
        createdAt: input.endedAt,
      },
      match: initialMatch,
    })
    await expect(archiveCompletedMatch(archiveDb.db, input)).rejects.toThrow(CompletedMatchArchiveError)
    expect(archiveDb.batchCalls).toBe(0)
    expect(archiveDb.matchRow).toEqual(initialMatch)
    expect(archiveDb.archiveRow?.stateJson).toBe('{}')
  })
})

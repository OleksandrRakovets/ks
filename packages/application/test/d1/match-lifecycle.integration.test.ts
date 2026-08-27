import { buildMatchConfig, CreateMatchRequestSchema, createSparringMatch } from '@ks/competition'
import {
  type MatchCommand,
  MatchIdSchema,
  newCommandId,
  PlayerRefSchema,
  type ProtocolEntry,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import { applyD1Migrations, env, reset } from 'cloudflare:test'
import * as v from 'valibot'
import { beforeEach, describe, expect, test } from 'vitest'

import {
  archiveCompletedMatch,
  CompletedMatchArchiveError,
  type CompletedMatchArchiveInput,
  finishCompletedMatch,
} from '../../src/d1/completed-matches'
import { activateMatch, type ActiveMatchCatalogInput, beginMatchCreation } from '../../src/d1/match-lifecycle'
import { getMatchRow, listMatchRows } from '../../src/d1/matches'
import { getProtocolArchive } from '../../src/d1/protocol-archives'
import { createApplicationDatabaseClient } from '../../src/d1/types'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const otherMatchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAW')
const newestMatchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAX')
const creatingMatchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAY')
const seatAPlayerRef = v.parse(PlayerRefSchema, 'gp_01HX0000000000000000000000')
const seatBPlayerRef = v.parse(PlayerRefSchema, 'gp_01HX0000000000000000000001')
const createdAt = v.parse(UnixEpochMillisecondsSchema, 1_000)

const createRequest = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 2, B: 2 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: seatAPlayerRef },
    { seat: 'B', playerRef: seatBPlayerRef },
  ],
})

function catalogInput(id = matchId, timestamp = createdAt): ActiveMatchCatalogInput {
  return { matchId: id, gameKey: 'free-pyramid', seatAPlayerRef, seatBPlayerRef, createdAt: timestamp }
}

function terminalArchiveInput(id = matchId): CompletedMatchArchiveInput {
  const config = buildMatchConfig(id, createRequest)
  const session = createSparringMatch(config)
  const acceptedAt = v.parse(UnixEpochMillisecondsSchema, 2_000)
  const protocolEntries: ProtocolEntry[] = []
  let acceptedSeq = 0
  for (const command of [
    { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
    { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
    { commandId: newCommandId(), source: 'game', command: { type: 'pot.record', seat: 'A', pottedBallCount: 2 } },
    { commandId: newCommandId(), source: 'game', command: { type: 'frame.award', seat: 'A' } },
  ] satisfies MatchCommand[]) {
    const decision = session.execute(command)
    if (decision._tag !== 'accepted') throw new Error(`Fixture command rejected: ${String(command.command.type)}`)
    acceptedSeq += 1
    decision.protocolEntryContents.forEach((entry, entryIndex) =>
      protocolEntries.push({
        ...entry,
        acceptedSeq,
        entryIndex,
        causedByCommandId: command.commandId,
        acceptedAt,
      }),
    )
  }
  const finalState = session.project().state
  if (finalState.status !== 'finished') throw new Error('Fixture did not finish')
  return {
    matchId: id,
    gameKey: 'free-pyramid',
    createdAt,
    sourceLatestSeq: acceptedSeq,
    endedAt: acceptedAt,
    protocolEntries,
    finalState: { ...finalState, status: 'finished' as const },
  }
}

beforeEach(async () => {
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

describe('real D1 match lifecycle', () => {
  test('creates, lists, archives, and finishes a match idempotently', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    const input = catalogInput()
    await beginMatchCreation(db, input)
    await beginMatchCreation(db, input)
    await expect(beginMatchCreation(db, { ...input, gameKey: 'combined-pyramid' })).rejects.toThrow(
      'Match row conflicts with room creation',
    )
    await activateMatch(db, matchId)

    await beginMatchCreation(db, catalogInput(otherMatchId, v.parse(UnixEpochMillisecondsSchema, 3_000)))
    await activateMatch(db, otherMatchId)
    await env.DB.prepare('UPDATE matches SET status = ? WHERE match_id = ?').bind('finished', otherMatchId).run()
    await beginMatchCreation(db, catalogInput(newestMatchId, v.parse(UnixEpochMillisecondsSchema, 4_000)))
    await activateMatch(db, newestMatchId)
    await beginMatchCreation(db, catalogInput(creatingMatchId, v.parse(UnixEpochMillisecondsSchema, 5_000)))

    expect(await getMatchRow(db, matchId)).toMatchObject({ matchId, status: 'active' })
    expect((await listMatchRows(db)).map((row) => row.matchId)).toEqual([newestMatchId, matchId, otherMatchId])

    const archive = terminalArchiveInput()
    await archiveCompletedMatch(db, archive)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'finalizing' })
    expect(await getProtocolArchive(db, matchId)).toMatchObject({
      sourceLatestSeq: archive.sourceLatestSeq,
      protocolVersion: 1,
      state: archive.finalState,
    })
    await archiveCompletedMatch(db, archive)
    await expect(archiveCompletedMatch(db, { ...archive, sourceLatestSeq: archive.sourceLatestSeq + 1 })).rejects.toThrow(
      CompletedMatchArchiveError,
    )
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'finalizing' })

    await finishCompletedMatch(db, matchId)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'finished' })
  })

  test.each([
    ['invalid envelope', (input: CompletedMatchArchiveInput) => ({ ...input, sourceLatestSeq: input.sourceLatestSeq + 1 })],
    [
      'Protocol ownership mismatch',
      (input: CompletedMatchArchiveInput) => {
        const protocolEntries = [...input.protocolEntries]
        protocolEntries[0] = { ...protocolEntries[0]!, entryIndex: 2 }
        return { ...input, protocolEntries }
      },
    ],
    [
      'terminal state mismatch',
      (input: CompletedMatchArchiveInput) => ({ ...input, finalState: terminalArchiveInput(otherMatchId).finalState }),
    ],
  ])('rejects %s without changing the match row or archive', async (_label, corrupt) => {
    const db = createApplicationDatabaseClient(env.DB)
    await beginMatchCreation(db, catalogInput())
    await activateMatch(db, matchId)
    await expect(archiveCompletedMatch(db, corrupt(terminalArchiveInput()))).rejects.toThrow(CompletedMatchArchiveError)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'active' })
    expect(await getProtocolArchive(db, matchId)).toBeNull()
  })

  test('rejects conflicting persisted archive data without changing the active match row', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    await beginMatchCreation(db, catalogInput())
    await activateMatch(db, matchId)
    const archive = terminalArchiveInput()
    await env.DB.prepare(
      'INSERT INTO match_protocol_archives (match_id, source_latest_seq, protocol_version, rows_json, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(matchId, archive.sourceLatestSeq, 1, '[]', '{}', archive.endedAt)
      .run()
    await expect(archiveCompletedMatch(db, archive)).rejects.toThrow(CompletedMatchArchiveError)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'active' })
    expect(
      (await env.DB.prepare('SELECT state_json FROM match_protocol_archives WHERE match_id = ?').bind(matchId).first())
        ?.state_json,
    ).toBe('{}')
  })

  test('allows only one of two concurrent conflicting archives to finalize the match', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    await beginMatchCreation(db, catalogInput())
    await activateMatch(db, matchId)
    const first = terminalArchiveInput()
    const conflictingTimestamp = v.parse(UnixEpochMillisecondsSchema, first.endedAt + 1)
    const candidates = [
      first,
      {
        ...terminalArchiveInput(),
        endedAt: conflictingTimestamp,
        protocolEntries: first.protocolEntries.map((entry) => ({ ...entry, acceptedAt: conflictingTimestamp })),
      },
    ]

    const results = await Promise.allSettled(candidates.map(async (candidate) => await archiveCompletedMatch(db, candidate)))

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'finalizing' })
    expect(await getProtocolArchive(db, matchId)).not.toBeNull()
  })

  test('reads a locally seeded historical game key archive', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    const state = {
      matchId,
      gameKey: 'historical-game',
      targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
      status: 'finished',
      currentFrameIndex: 1,
      framesWonBySeat: { A: 1, B: 0 },
      frames: [{ frameIndex: 1, pointsBySeat: { A: 8, B: 2 }, breakerSeat: 'A', winnerSeat: 'A' }],
    }
    const entries = [
      {
        acceptedSeq: 1,
        entryIndex: 0,
        causedByCommandId: newCommandId(),
        acceptedAt: 2_000,
        gameKey: 'historical-game',
        frameIndex: 1,
        source: 'system',
        entryType: 'match-ended',
        seat: 'A',
        body: {},
      },
    ]
    await seedArchive(JSON.stringify(entries), JSON.stringify(state), 1)
    expect(await getProtocolArchive(db, matchId)).toMatchObject({ protocolVersion: 1, entries, state })
  })

  test.each([
    ['malformed JSON', '[', '{}', 1, `Protocol archive storage corruption for match ${matchId}`],
    ['unsupported version', '[]', '{}', 2, `Unsupported protocol archive version 2 for match ${matchId}`],
  ])('reports %s in a persisted archive', async (_label, rowsJson, stateJson, version, message) => {
    const db = createApplicationDatabaseClient(env.DB)
    await seedArchive(rowsJson, stateJson, version)
    await expect(getProtocolArchive(db, matchId)).rejects.toThrow(message)
  })

  test('rejects a persisted zero source sequence', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    const state = terminalArchiveInput().finalState
    await seedArchive('[]', JSON.stringify(state), 1, 0)
    await expect(getProtocolArchive(db, matchId)).rejects.toThrow(`Protocol archive storage corruption for match ${matchId}`)
  })
})

async function seedArchive(rowsJson: string, stateJson: string, protocolVersion: number, sourceLatestSeq = 4): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO match_protocol_archives (match_id, source_latest_seq, protocol_version, rows_json, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(matchId, sourceLatestSeq, protocolVersion, rowsJson, stateJson, 2_000)
    .run()
}

import { buildMatchConfig, CreateMatchRequestSchema, draftSparringMatchCreation, restoreSparringMatch } from '@ks/competition'
import {
  type CommandId,
  type ControlCommand,
  type MatchConfig,
  type MatchFactContent,
  MatchIdSchema,
  newCommandId,
  newFactId,
  PlayerRefSchema,
  type StoredMatchFact,
  StoredMatchFactSchema,
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

function storedFact(
  draft: MatchFactContent,
  config: MatchConfig,
  seq: number,
  commandId: CommandId,
  acceptedAt: number,
): StoredMatchFact {
  return v.parse(StoredMatchFactSchema, {
    factId: newFactId(),
    matchId: config.matchId,
    causedByCommandId: draft.type === 'match.created' ? null : commandId,
    acceptedAt,
    seq,
    type: draft.type,
    payload: draft.payload,
  })
}

function terminalArchiveInput(id = matchId): CompletedMatchArchiveInput {
  const config = buildMatchConfig(id, createRequest)
  const creation = draftSparringMatchCreation(config)
  const session = restoreSparringMatch([[creation]])
  const acceptedAt = 2_000
  const facts: StoredMatchFact[] = [storedFact(creation, config, 1, newCommandId(), acceptedAt)]
  for (const command of [
    { source: 'match', commandType: 'frame.start', command: {} },
    { source: 'match', commandType: 'frame.commence', command: { seat: 'A' } },
    { source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 2 } },
    { source: 'game', commandType: 'frame.award', command: { seat: 'A' } },
  ] satisfies ControlCommand[]) {
    const decision = session.execute(command)
    if (decision._tag !== 'accepted') throw new Error(`Fixture command rejected: ${command.commandType}`)
    const commandId = newCommandId()
    for (const draft of decision.facts) facts.push(storedFact(draft, config, facts.length + 1, commandId, acceptedAt))
  }
  return {
    matchId: id,
    sourceLatestSeq: facts.length,
    endedAt: v.parse(UnixEpochMillisecondsSchema, acceptedAt),
    facts,
    projection: session.project(),
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
      'Match catalog entry conflicts with room creation',
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
      state: archive.projection.state,
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
      'semantic replay mismatch',
      (input: CompletedMatchArchiveInput) => {
        const facts = [...input.facts]
        const index = facts.findIndex((fact) => fact.type === 'game.command')
        const fact = facts[index]!
        if (fact.type !== 'game.command') throw new Error('Expected game command fixture fact')
        facts[index] = { ...fact, payload: { ...fact.payload, command: { seat: 'B', points: 99 } } }
        return { ...input, facts }
      },
    ],
    [
      'terminal projection mismatch',
      (input: CompletedMatchArchiveInput) => ({ ...input, projection: terminalArchiveInput(otherMatchId).projection }),
    ],
  ])('rejects %s without changing the catalog or archive', async (_label, corrupt) => {
    const db = createApplicationDatabaseClient(env.DB)
    await beginMatchCreation(db, catalogInput())
    await activateMatch(db, matchId)
    await expect(archiveCompletedMatch(db, corrupt(terminalArchiveInput()))).rejects.toThrow(CompletedMatchArchiveError)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'active' })
    expect(await getProtocolArchive(db, matchId)).toBeNull()
  })

  test('rejects conflicting persisted archive data without changing the active catalog row', async () => {
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
    await seedArchive(JSON.stringify([]), JSON.stringify(state), 1)
    expect(await getProtocolArchive(db, matchId)).toMatchObject({ protocolVersion: 1, rows: [], state })
  })

  test.each([
    ['malformed JSON', '[', '{}', 1, `Protocol archive storage corruption for match ${matchId}`],
    ['unsupported version', '[]', '{}', 2, `Unsupported protocol archive version 2 for match ${matchId}`],
  ])('reports %s in a persisted archive', async (_label, rowsJson, stateJson, version, message) => {
    const db = createApplicationDatabaseClient(env.DB)
    await seedArchive(rowsJson, stateJson, version)
    await expect(getProtocolArchive(db, matchId)).rejects.toThrow(message)
  })
})

async function seedArchive(rowsJson: string, stateJson: string, protocolVersion: number): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO match_protocol_archives (match_id, source_latest_seq, protocol_version, rows_json, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(matchId, 4, protocolVersion, rowsJson, stateJson, 2_000)
    .run()
}

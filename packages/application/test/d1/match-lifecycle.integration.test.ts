import { buildMatchConfig, createMatch, CreateMatchRequest, ProtocolEntry } from '@ks/competition'
import {
  GuestPlayerId,
  type MatchCommand,
  MatchId,
  newCommandId,
  PlayerRef,
  projectMatchScore,
  UnixEpochMilliseconds,
  VerifiedPlayerId,
} from '@ks/core'
import { applyD1Migrations, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import * as v from 'valibot'
import { beforeEach, describe, expect, test } from 'vitest'

import { guestPlayers, sparringMatches, verifiedPlayers } from '../../src/d1/schema'
import {
  archiveFinishedMatch,
  markMatchFinished,
  MatchFinalizationError,
} from '../../src/d1/sparring/finished-matches'
import { getFinishedMatchArchive, getProtocolArchive } from '../../src/d1/sparring/match-archives'
import {
  activateMatch,
  type ActiveMatchCatalogInput,
  beginMatchCreation,
} from '../../src/d1/sparring/match-lifecycle'
import {
  findFinishedMatchTime,
  getMatchRow,
  listFinishedMatchRows,
  listLiveMatchRows,
} from '../../src/d1/sparring/matches'
import { createApplicationDatabaseClient } from '../../src/d1/types'
import type { MatchRoomArchiveTransfer } from '../../src/match-room-client'

const matchId = v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAV')

const otherMatchId = v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAW')

const newestMatchId = v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAX')

const creatingMatchId = v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAY')

const seatAPlayerRef = v.parse(PlayerRef, 'gp_01HX0000000000000000000000')

const seatBPlayerRef = v.parse(PlayerRef, 'gp_01HX0000000000000000000001')

const createdAt = v.parse(UnixEpochMilliseconds, 1_000)

const createRequest = v.parse(CreateMatchRequest, {
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

function finishedMatchTransfer(id = matchId, timestamp = createdAt): MatchRoomArchiveTransfer {
  const config = buildMatchConfig(id, createRequest)
  const session = createMatch(config)
  const acceptedAt = v.parse(UnixEpochMilliseconds, timestamp + 1_000)
  const protocolEntries: ProtocolEntry[] = []
  let acceptedSeq = 0

  for (const command of [
    { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
    { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
    {
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 2 },
    },
    { commandId: newCommandId(), source: 'game', command: { type: 'frame.award', seat: 'A' } },
  ] satisfies MatchCommand[]) {
    const decision = session.execute(command)

    if (decision._tag !== 'accepted') throw new Error(`Fixture command rejected: ${command.command.type}`)
    acceptedSeq += 1
    decision.protocolEntryContents.forEach((entry, entryIndex) => {
      protocolEntries.push(
        v.parse(ProtocolEntry, {
          ...entry,
          acceptedSeq,
          entryIndex,
          causedByCommandId: command.commandId,
          acceptedAt,
        }),
      )
    })
  }

  const finalState = session.state()

  if (finalState.status !== 'finished') throw new Error('Fixture did not finish')

  return {
    matchId: id,
    gameKey: 'free-pyramid',
    createdAt: timestamp,
    sourceLatestSeq: acceptedSeq,
    endedAt: acceptedAt,
    protocolEntries,
    finalState: { ...finalState, status: 'finished' as const },
    gameResult: null,
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

    const otherCreatedAt = v.parse(UnixEpochMilliseconds, 3_000)
    await beginMatchCreation(db, catalogInput(otherMatchId, otherCreatedAt))
    await activateMatch(db, otherMatchId)
    const otherArchive = finishedMatchTransfer(otherMatchId, otherCreatedAt)
    await archiveFinishedMatch(db, otherArchive)
    await markMatchFinished(db, otherArchive)
    await beginMatchCreation(db, catalogInput(newestMatchId, v.parse(UnixEpochMilliseconds, 4_000)))
    await activateMatch(db, newestMatchId)
    await beginMatchCreation(db, catalogInput(creatingMatchId, v.parse(UnixEpochMilliseconds, 5_000)))

    expect(await getMatchRow(db, matchId)).toMatchObject({ matchId, status: 'active' })

    expect(
      (await listLiveMatchRows(db, v.parse(UnixEpochMilliseconds, 0), 'en')).map((row) => row.matchId),
    ).toEqual([newestMatchId, matchId, otherMatchId])

    const archive = {
      ...finishedMatchTransfer(),
      endedAt: v.parse(UnixEpochMilliseconds, 4_500),
    }

    await archiveFinishedMatch(db, archive)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'active' })
    expect(await getProtocolArchive(db, matchId)).toMatchObject({
      sourceLatestSeq: archive.sourceLatestSeq,
      protocolVersion: 1,
      state: archive.finalState,
    })
    await archiveFinishedMatch(db, archive)
    await expect(
      archiveFinishedMatch(db, { ...archive, sourceLatestSeq: archive.sourceLatestSeq + 1 }),
    ).rejects.toThrow(MatchFinalizationError)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'active' })

    await markMatchFinished(db, archive)
    await markMatchFinished(db, archive)
    expect(await getMatchRow(db, matchId)).toMatchObject({
      status: 'finished',
      finalSourceLatestSeq: archive.sourceLatestSeq,
      finalScore: {
        matchTargetFrames: 1,
        frameTargetPointsBySeat: { A: 2, B: 2 },
        framesWonBySeat: { A: 1, B: 0 },
        singleFramePointsBySeat: { A: 2, B: 0 },
        activeFrame: null,
      },
    })
    expect(
      (await env.DB.prepare('SELECT ended_at FROM sparring_matches WHERE match_id = ?').bind(matchId).first())
        ?.ended_at,
    ).toBe(archive.endedAt)
    expect(
      (
        await listFinishedMatchRows(
          db,
          {
            start: createdAt,
            end: v.parse(UnixEpochMilliseconds, 4_000),
          },
          'en',
        )
      ).map((row) => row.matchId),
    ).toEqual([otherMatchId, matchId])
    expect(await findFinishedMatchTime(db, { before: v.parse(UnixEpochMilliseconds, 3_000) })).toBe(createdAt)
    expect(await findFinishedMatchTime(db, { from: v.parse(UnixEpochMilliseconds, 2_000) })).toBe(3_000)
    expect(
      (await listLiveMatchRows(db, v.parse(UnixEpochMilliseconds, 3_000), 'en')).map((row) => row.matchId),
    ).toEqual([newestMatchId, matchId, otherMatchId])
  })

  test('lists a crowded finished-match day with localized guest and verified names and missing-player fallback', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    const verifiedRef = v.parse(PlayerRef, 'vp_01HX0000000000000000000002')
    const missingRef = v.parse(PlayerRef, 'gp_01HX0000000000000000000003')

    await db.insert(guestPlayers).values({
      guestPlayerId: v.parse(GuestPlayerId, seatAPlayerRef.slice(3)),
      firstNameUk: 'Галя',
      lastNameUk: 'Гість',
      firstNameEn: 'Gina',
      lastNameEn: 'Guest',
      createdAt,
    })
    await db.insert(verifiedPlayers).values({
      verifiedPlayerId: v.parse(VerifiedPlayerId, verifiedRef.slice(3)),
      firstNameUk: 'Віра',
      lastNameUk: 'Тест',
      firstNameEn: 'Vera',
      lastNameEn: 'Verified',
      createdAt,
    })

    const score = JSON.stringify(projectMatchScore(finishedMatchTransfer().finalState))

    const rows = Array.from({ length: 26 }, (_, index) => ({
      matchId: v.parse(MatchId, `${matchId.slice(0, 24)}${String(index).padStart(2, '0')}`),
      gameKey: 'free-pyramid' as const,
      status: 'finished' as const,
      createdAt: v.parse(UnixEpochMilliseconds, createdAt + index),
      endedAt: v.parse(UnixEpochMilliseconds, createdAt + 1_000 + index),
      seatAPlayerRef: index % 2 ? verifiedRef : seatAPlayerRef,
      seatBPlayerRef: index === 0 ? missingRef : index % 2 ? seatAPlayerRef : verifiedRef,
      finalSourceLatestSeq: 4,
      finalScoreJson: score,
    }))

    for (const row of rows) await db.insert(sparringMatches).values(row)

    const range = { start: createdAt, end: v.parse(UnixEpochMilliseconds, createdAt + 26) }
    const uk = await listFinishedMatchRows(db, range, 'uk')
    const en = await listFinishedMatchRows(db, range, 'en')

    expect(uk.map((row) => row.matchId)).toEqual(rows.map((row) => row.matchId).reverse())
    expect(uk[0]?.participants).toEqual({
      A: { playerRef: verifiedRef, displayName: 'Віра Тест', shortDisplayName: 'В. Тест' },
      B: { playerRef: seatAPlayerRef, displayName: 'Галя Гість', shortDisplayName: 'Г. Гість' },
    })
    expect(uk[1]?.participants).toEqual({
      A: { playerRef: seatAPlayerRef, displayName: 'Галя Гість', shortDisplayName: 'Г. Гість' },
      B: { playerRef: verifiedRef, displayName: 'Віра Тест', shortDisplayName: 'В. Тест' },
    })
    expect(uk[25]?.participants.B).toEqual({
      playerRef: missingRef,
      displayName: missingRef,
      shortDisplayName: missingRef,
    })
    expect(en[0]?.participants.A).toMatchObject({
      displayName: 'Vera Verified',
      shortDisplayName: 'V. Verified',
    })
    expect(en[0]?.participants.B).toMatchObject({ displayName: 'Gina Guest', shortDisplayName: 'G. Guest' })
    expect(
      (await listLiveMatchRows(db, v.parse(UnixEpochMilliseconds, 0), 'en')).map((row) => row.matchId),
    ).toEqual(rows.map((row) => row.matchId).reverse())
  })

  test('rejects conflicting persisted archive data without changing the active match row', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    await beginMatchCreation(db, catalogInput())
    await activateMatch(db, matchId)
    const archive = finishedMatchTransfer()
    await env.DB.prepare(
      'INSERT INTO sparring_match_archives (match_id, source_latest_seq, protocol_version, rows_json, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(matchId, archive.sourceLatestSeq, 1, '[]', '{}', archive.endedAt)
      .run()
    await expect(archiveFinishedMatch(db, archive)).rejects.toThrow(MatchFinalizationError)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'active' })
    expect(
      (
        await env.DB.prepare('SELECT state_json FROM sparring_match_archives WHERE match_id = ?')
          .bind(matchId)
          .first()
      )?.state_json,
    ).toBe('{}')
  })

  test('rejects finishing a matching archive when the match row has a conflicting endedAt', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    await beginMatchCreation(db, catalogInput())
    await activateMatch(db, matchId)
    const archive = finishedMatchTransfer()
    await archiveFinishedMatch(db, archive)
    const conflictingEndedAt = archive.endedAt + 1
    await env.DB.prepare('UPDATE sparring_matches SET ended_at = ? WHERE match_id = ?')
      .bind(conflictingEndedAt, matchId)
      .run()

    await expect(markMatchFinished(db, archive)).rejects.toThrow(MatchFinalizationError)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'active' })
    expect(
      (await env.DB.prepare('SELECT ended_at FROM sparring_matches WHERE match_id = ?').bind(matchId).first())
        ?.ended_at,
    ).toBe(conflictingEndedAt)
  })

  test('concurrent conflicting archive attempts converge on one immutable archive', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    await beginMatchCreation(db, catalogInput())
    await activateMatch(db, matchId)
    const first = finishedMatchTransfer()
    const conflictingTimestamp = v.parse(UnixEpochMilliseconds, first.endedAt + 1)

    const candidates = [
      first,
      {
        ...finishedMatchTransfer(),
        endedAt: conflictingTimestamp,
        protocolEntries: first.protocolEntries.map((entry) => ({
          ...entry,
          acceptedAt: conflictingTimestamp,
        })),
      },
    ]

    const results = await Promise.allSettled(
      candidates.map(async (candidate) => archiveFinishedMatch(db, candidate)),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(await getMatchRow(db, matchId)).toMatchObject({ status: 'active' })
    expect(
      candidates.map((candidate) => ({
        sourceLatestSeq: candidate.sourceLatestSeq,
        protocolVersion: 1,
        entries: candidate.protocolEntries,
        state: candidate.finalState,
        gameResult: candidate.gameResult,
      })),
    ).toContainEqual(await getProtocolArchive(db, matchId))
  })

  test('reads the long-game result without loading Protocol rows and rejects a changed archive retry', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    await beginMatchCreation(db, { ...catalogInput(), gameKey: 'free-pyramid-long' })
    await activateMatch(db, matchId)
    const base = finishedMatchTransfer()

    const archive = {
      ...base,
      gameKey: 'free-pyramid-long' as const,
      finalState: { ...base.finalState, gameKey: 'free-pyramid-long' },
      gameResult: {
        gameKey: 'free-pyramid-long' as const,
        racks: [{ rackNumber: 1, scoreBySeat: { A: 2, B: 0 } }],
      },
    }

    await archiveFinishedMatch(db, archive)
    await archiveFinishedMatch(db, archive)
    await expect(
      archiveFinishedMatch(db, {
        ...archive,
        gameResult: { ...archive.gameResult, racks: [{ rackNumber: 1, scoreBySeat: { A: 1, B: 1 } }] },
      }),
    ).rejects.toThrow(MatchFinalizationError)

    await env.DB.prepare('UPDATE sparring_match_archives SET rows_json = ? WHERE match_id = ?')
      .bind('[', matchId)
      .run()

    expect(await getFinishedMatchArchive(db, matchId)).toMatchObject({
      state: archive.finalState,
      gameResult: archive.gameResult,
    })
    await expect(getProtocolArchive(db, matchId)).rejects.toThrow('Protocol archive storage corruption')
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
    const state = finishedMatchTransfer().finalState
    await seedArchive('[]', JSON.stringify(state), 1, 0)
    await expect(getProtocolArchive(db, matchId)).rejects.toThrow(
      `Protocol archive storage corruption for match ${matchId}`,
    )
  })
})

async function seedArchive(
  rowsJson: string,
  stateJson: string,
  protocolVersion: number,
  sourceLatestSeq = 4,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO sparring_match_archives (match_id, source_latest_seq, protocol_version, rows_json, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(matchId, sourceLatestSeq, protocolVersion, rowsJson, stateJson, 2_000)
    .run()
}

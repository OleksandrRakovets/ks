import {
  buildMatchConfig,
  createMatch,
  CreateMatchRequest,
  projectMatchScore,
  ProtocolEntry,
} from '@ks/competition'
import {
  FixedClock,
  GuestPlayerId,
  type MatchCommand,
  MatchId,
  newCommandId,
  PlayerRef,
  UnixEpochMilliseconds,
  VerifiedPlayerId,
} from '@ks/core'
import { applyD1Migrations, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import * as v from 'valibot'
import { beforeEach, describe, expect, test } from 'vitest'

import { createApplicationDatabaseClient } from '../../src/d1/client'
import { guestPlayers, sparringMatches, verifiedPlayers } from '../../src/d1/schema'
import type { MatchRoomArchiveTransfer } from '../../src/match/match-room'
import { PlayerStorage } from '../../src/player/storage/player-storage'
import { createApplication } from '../../src/server'
import { MatchFinalizationError } from '../../src/sparring/storage/protocol-archive'
import type { MatchCreationRecord } from '../../src/sparring/storage/records'
import { SparringMatchStorage } from '../../src/sparring/storage/sparring-match-storage'

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

function catalogInput(id = matchId, timestamp = createdAt): MatchCreationRecord {
  return {
    matchId: id,
    gameKey: 'free-pyramid',
    participantRefs: { A: seatAPlayerRef, B: seatBPlayerRef },
    createdAt: timestamp,
  }
}

function finishedMatchTransfer(id = matchId, timestamp = createdAt): MatchRoomArchiveTransfer {
  const config = buildMatchConfig(id, createRequest)
  const session = createMatch(config)
  const acceptedAt = v.parse(UnixEpochMilliseconds, timestamp + 1_000)
  const protocolEntries: ProtocolEntry[] = []
  let acceptedSeq = 0

  for (const command of [
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
  test('soft deletion preserves the row, excludes it from both lists and day navigation, and creates no archive', async () => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    const endedAt = v.parse(UnixEpochMilliseconds, 5_000)
    await matches.beginCreation(catalogInput())
    await expect(matches.markDiscarded(matchId, endedAt)).rejects.toThrow('cannot mark Match')
    await matches.activate(matchId)
    await matches.markDiscarded(matchId, endedAt)
    await matches.markDiscarded(matchId, endedAt)
    await matches.activate(matchId)
    expect(await matches.findMatch(matchId)).toEqual({ ...catalogInput(), status: 'discarded', endedAt })
    expect(await matches.findProtocolArchive(matchId)).toBeNull()
    expect(await matches.findFinishedArchive(matchId)).toBeNull()
    await expect(matches.markDiscarded(matchId, v.parse(UnixEpochMilliseconds, endedAt + 1))).rejects.toThrow(
      'cannot mark Match',
    )
    await expect(matches.archiveFinished(finishedMatchTransfer())).rejects.toThrow(MatchFinalizationError)
    await expect(matches.markFinished(finishedMatchTransfer())).rejects.toThrow(MatchFinalizationError)
    await expect(matches.beginCreation(catalogInput())).rejects.toThrow(
      'Match row conflicts with room creation',
    )

    const otherCreatedAt = v.parse(UnixEpochMilliseconds, 3_000)
    await matches.beginCreation(catalogInput(otherMatchId, otherCreatedAt))
    await matches.activate(otherMatchId)
    const archive = finishedMatchTransfer(otherMatchId, otherCreatedAt)
    await matches.archiveFinished(archive)
    await matches.markFinished(archive)
    await expect(matches.markDiscarded(otherMatchId, endedAt)).rejects.toThrow('cannot mark Match')
    await matches.beginCreation(catalogInput(newestMatchId, v.parse(UnixEpochMilliseconds, 4_000)))
    await matches.activate(newestMatchId)
    expect((await matches.listLive(v.parse(UnixEpochMilliseconds, 0))).map((row) => row.matchId)).toEqual([
      newestMatchId,
      otherMatchId,
    ])
    expect((await matches.listFinished({ start: createdAt, end: endedAt })).map((row) => row.matchId)).toEqual(
      [otherMatchId],
    )
    expect(await matches.findFinishedTime({ before: otherCreatedAt })).toBeNull()
    expect(await matches.findFinishedTime({ from: createdAt })).toBe(otherCreatedAt)

    const application = createApplication(
      {
        DB: env.DB,
        MATCH_ROOM: {
          getByName: () => {
            throw new Error('Discarded reads must not select MatchRoom')
          },
        },
      },
      new FixedClock(new Date(createdAt), 'Europe/Kyiv'),
    )

    expect(await application.sparring.discardMatch(matchId, 'free-pyramid')).toEqual({ ok: true })
    expect(await application.sparring.readMatch(matchId, 'en', 'free-pyramid')).toEqual({
      ok: false,
      reason: 'unknown-match',
    })
  })

  test('creates and reuses guest players through storage', async () => {
    const players = new PlayerStorage(
      createApplicationDatabaseClient(env.DB),
      new FixedClock(new Date(createdAt), 'Europe/Kyiv'),
    )

    const name = { firstName: 'Alice', lastName: 'Alpha' }
    const playerRef = await players.ensureGuestRef(name)
    expect(await players.ensureGuestRef(name)).toBe(playerRef)
    expect(await players.readParticipant(playerRef)).toEqual({
      playerRef,
      names: { uk: name, en: name },
    })
    expect(await env.DB.prepare('SELECT created_at FROM guest_players').all()).toMatchObject({
      results: [{ created_at: createdAt }],
    })
  })

  test('creates, lists, archives, and finishes a match idempotently', async () => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    const input = catalogInput()
    await matches.beginCreation(input)
    await matches.beginCreation(input)
    await expect(matches.beginCreation({ ...input, gameKey: 'combined-pyramid' })).rejects.toThrow(
      'Match row conflicts with room creation',
    )
    await matches.activate(matchId)

    const otherCreatedAt = v.parse(UnixEpochMilliseconds, 3_000)
    await matches.beginCreation(catalogInput(otherMatchId, otherCreatedAt))
    await matches.activate(otherMatchId)
    const otherArchive = finishedMatchTransfer(otherMatchId, otherCreatedAt)
    await matches.archiveFinished(otherArchive)
    await matches.markFinished(otherArchive)
    await matches.beginCreation(catalogInput(newestMatchId, v.parse(UnixEpochMilliseconds, 4_000)))
    await matches.activate(newestMatchId)
    await matches.beginCreation(catalogInput(creatingMatchId, v.parse(UnixEpochMilliseconds, 5_000)))

    const record = await matches.findMatch(matchId)
    expect(record).toEqual({
      matchId,
      gameKey: 'free-pyramid',
      status: 'active',
      createdAt,
      participantRefs: { A: seatAPlayerRef, B: seatBPlayerRef },
    })
    expect(await matches.listMatches([matchId])).toEqual([record])
    expect(await matches.listMatches([])).toEqual([])

    expect((await matches.listLive(v.parse(UnixEpochMilliseconds, 0))).map((row) => row.matchId)).toEqual([
      newestMatchId,
      matchId,
      otherMatchId,
    ])

    const archive = {
      ...finishedMatchTransfer(),
      endedAt: v.parse(UnixEpochMilliseconds, 4_500),
    }

    await matches.archiveFinished(archive)
    expect(await matches.findMatch(matchId)).toMatchObject({ status: 'active' })
    expect(await matches.findProtocolArchive(matchId)).toMatchObject({
      sourceLatestSeq: archive.sourceLatestSeq,
      protocolVersion: 1,
      state: archive.finalState,
    })
    await matches.archiveFinished(archive)
    await expect(
      matches.archiveFinished({ ...archive, sourceLatestSeq: archive.sourceLatestSeq + 1 }),
    ).rejects.toThrow(MatchFinalizationError)
    expect(await matches.findMatch(matchId)).toMatchObject({ status: 'active' })

    await matches.markFinished(archive)
    await matches.markFinished(archive)
    expect(await matches.findMatch(matchId)).toMatchObject({
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
        await matches.listFinished({
          start: createdAt,
          end: v.parse(UnixEpochMilliseconds, 4_000),
        })
      ).map((row) => row.matchId),
    ).toEqual([otherMatchId, matchId])
    expect(await matches.findFinishedTime({ before: v.parse(UnixEpochMilliseconds, 3_000) })).toBe(createdAt)
    expect(await matches.findFinishedTime({ from: v.parse(UnixEpochMilliseconds, 2_000) })).toBe(3_000)
    expect((await matches.listLive(v.parse(UnixEpochMilliseconds, 3_000))).map((row) => row.matchId)).toEqual([
      newestMatchId,
      matchId,
      otherMatchId,
    ])
    // Finished rows leave the live list once they ended before the cutoff; active rows stay.
    expect((await matches.listLive(v.parse(UnixEpochMilliseconds, 4_001))).map((row) => row.matchId)).toEqual([
      newestMatchId,
      matchId,
    ])

    const application = createApplication(
      {
        DB: env.DB,
        MATCH_ROOM: {
          getByName: () => {
            throw new Error('Finished reads must not select MatchRoom')
          },
        },
      },
      new FixedClock(new Date(createdAt), 'Europe/Kyiv'),
    )

    expect(await application.sparring.readMatch(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      lifecycle: 'finished',
      matchId,
      gameKey: 'free-pyramid',
      winnerSeat: 'A',
      framesWonBySeat: { A: 1, B: 0 },
      representedFrame: { frameIndex: 1, pointsBySeat: { A: 2, B: 0 } },
    })
  })

  test('rejects unmigrated archives and scores instead of inferring winners on reads or retries', async () => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    await matches.beginCreation(catalogInput())
    await matches.activate(matchId)
    const archive = finishedMatchTransfer()
    await matches.archiveFinished(archive)
    await matches.markFinished(archive)
    const legacyStateJson = JSON.stringify({ ...archive.finalState, winnerSeat: undefined })
    const legacyScoreJson = JSON.stringify({ ...projectMatchScore(archive.finalState), winnerSeat: undefined })
    await env.DB.prepare('UPDATE sparring_match_archives SET state_json = ? WHERE match_id = ?')
      .bind(legacyStateJson, matchId)
      .run()
    await env.DB.prepare('UPDATE sparring_matches SET final_score_json = ? WHERE match_id = ?')
      .bind(legacyScoreJson, matchId)
      .run()

    await expect(matches.findFinishedArchive(matchId)).rejects.toThrow('Protocol archive storage corruption')
    await expect(matches.findProtocolArchive(matchId)).rejects.toThrow('Protocol archive storage corruption')
    await expect(matches.findMatch(matchId)).rejects.toThrow(
      'Invalid key: Expected "winnerSeat" but received undefined',
    )
    await expect(matches.listFinished({ start: createdAt, end: archive.endedAt })).rejects.toThrow(
      'Invalid key: Expected "winnerSeat" but received undefined',
    )
    await expect(matches.archiveFinished(archive)).rejects.toThrow(MatchFinalizationError)
    await expect(matches.markFinished(archive)).rejects.toThrow(MatchFinalizationError)
    expect(
      (
        await env.DB.prepare('SELECT state_json FROM sparring_match_archives WHERE match_id = ?')
          .bind(matchId)
          .first()
      )?.state_json,
    ).toBe(legacyStateJson)
  })

  test('persists an explicit winner independent of frame scores and rejects a changed winner on retry', async () => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    await matches.beginCreation(catalogInput())
    await matches.activate(matchId)
    const base = finishedMatchTransfer()

    const archive = {
      ...base,
      finalState: { ...base.finalState, status: 'finished' as const, winnerSeat: 'B' as const },
    }

    await matches.archiveFinished(archive)
    await matches.markFinished(archive)
    expect(await matches.findFinishedArchive(matchId)).toMatchObject({
      state: { winnerSeat: 'B', framesWonBySeat: { A: 1, B: 0 } },
    })
    expect(await matches.findMatch(matchId)).toMatchObject({ finalScore: { winnerSeat: 'B' } })
    await expect(matches.archiveFinished(base)).rejects.toThrow(MatchFinalizationError)
    await expect(matches.markFinished(base)).rejects.toThrow(MatchFinalizationError)
  })

  test('lists a finished-match day with localized guest and verified names and missing-player fallback', async () => {
    const db = createApplicationDatabaseClient(env.DB)
    const matches = new SparringMatchStorage(db)
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

    const rows = (
      [
        [seatAPlayerRef, missingRef],
        [seatAPlayerRef, verifiedRef],
        [verifiedRef, seatAPlayerRef],
      ] as const
    ).map(([seatA, seatB], index) => ({
      matchId: v.parse(MatchId, `${matchId.slice(0, 24)}${String(index).padStart(2, '0')}`),
      gameKey: 'free-pyramid' as const,
      status: 'finished' as const,
      createdAt: v.parse(UnixEpochMilliseconds, createdAt + index),
      endedAt: v.parse(UnixEpochMilliseconds, createdAt + 1_000 + index),
      seatAPlayerRef: seatA,
      seatBPlayerRef: seatB,
      finalSourceLatestSeq: 4,
      finalScoreJson: score,
    }))

    for (const row of rows) await db.insert(sparringMatches).values(row)

    const range = { start: createdAt, end: v.parse(UnixEpochMilliseconds, createdAt + rows.length) }
    const records = await matches.listFinished(range)
    expect(records.map((row) => row.matchId)).toEqual(rows.map((row) => row.matchId).reverse())

    const application = createApplication(
      {
        DB: env.DB,
        MATCH_ROOM: {
          getByName: () => {
            throw new Error('Finished lists must not select MatchRoom')
          },
        },
      },
      new FixedClock(new Date(createdAt), 'Europe/Kyiv'),
    )

    const uk = (await application.sparring.listFinishedMatches('uk', '1970-01-01')).matches
    const en = (await application.sparring.listFinishedMatches('en', '1970-01-01')).matches

    expect(uk.map((row) => row.matchId)).toEqual(rows.map((row) => row.matchId).reverse())
    expect(uk[0]?.participants).toEqual({
      A: { playerRef: verifiedRef, displayName: 'Віра Тест', shortDisplayName: 'В. Тест' },
      B: { playerRef: seatAPlayerRef, displayName: 'Галя Гість', shortDisplayName: 'Г. Гість' },
    })
    expect(uk[1]?.participants).toEqual({
      A: { playerRef: seatAPlayerRef, displayName: 'Галя Гість', shortDisplayName: 'Г. Гість' },
      B: { playerRef: verifiedRef, displayName: 'Віра Тест', shortDisplayName: 'В. Тест' },
    })
    expect(uk[2]?.participants.B).toEqual({
      playerRef: missingRef,
      displayName: missingRef,
      shortDisplayName: missingRef,
    })
    expect(en[0]?.participants.A).toMatchObject({
      displayName: 'Vera Verified',
      shortDisplayName: 'V. Verified',
    })
    expect(en[0]?.participants.B).toMatchObject({ displayName: 'Gina Guest', shortDisplayName: 'G. Guest' })
    const players = new PlayerStorage(db, new FixedClock(new Date(createdAt), 'Europe/Kyiv'))
    expect(await players.readParticipant(verifiedRef)).toEqual(records[0]?.participants.A)
    expect(await players.readParticipant(missingRef)).toEqual(records[2]?.participants.B)
    expect((await matches.listLive(v.parse(UnixEpochMilliseconds, 0))).map((row) => row.matchId)).toEqual(
      rows.map((row) => row.matchId).reverse(),
    )
  })

  test('rejects conflicting persisted archive data without changing the active match row', async () => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    await matches.beginCreation(catalogInput())
    await matches.activate(matchId)
    const archive = finishedMatchTransfer()
    await env.DB.prepare(
      'INSERT INTO sparring_match_archives (match_id, source_latest_seq, protocol_version, rows_json, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(matchId, archive.sourceLatestSeq, 1, '[]', '{}', archive.endedAt)
      .run()
    await expect(matches.archiveFinished(archive)).rejects.toThrow(MatchFinalizationError)
    expect(await matches.findMatch(matchId)).toMatchObject({ status: 'active' })
    expect(
      (
        await env.DB.prepare('SELECT state_json FROM sparring_match_archives WHERE match_id = ?')
          .bind(matchId)
          .first()
      )?.state_json,
    ).toBe('{}')
  })

  test('rejects finishing a matching archive when the match row has a conflicting endedAt', async () => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    await matches.beginCreation(catalogInput())
    await matches.activate(matchId)
    const archive = finishedMatchTransfer()
    await matches.archiveFinished(archive)
    const conflictingEndedAt = archive.endedAt + 1
    await env.DB.prepare('UPDATE sparring_matches SET ended_at = ? WHERE match_id = ?')
      .bind(conflictingEndedAt, matchId)
      .run()

    await expect(matches.markFinished(archive)).rejects.toThrow(MatchFinalizationError)
    expect(await matches.findMatch(matchId)).toMatchObject({ status: 'active' })
    expect(
      (await env.DB.prepare('SELECT ended_at FROM sparring_matches WHERE match_id = ?').bind(matchId).first())
        ?.ended_at,
    ).toBe(conflictingEndedAt)
  })

  test('concurrent conflicting archive attempts converge on one immutable archive', async () => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    await matches.beginCreation(catalogInput())
    await matches.activate(matchId)
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
      candidates.map(async (candidate) => matches.archiveFinished(candidate)),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(await matches.findMatch(matchId)).toMatchObject({ status: 'active' })
    expect(
      candidates.map((candidate) => ({
        sourceLatestSeq: candidate.sourceLatestSeq,
        protocolVersion: 1,
        entries: candidate.protocolEntries,
        state: candidate.finalState,
        gameResult: candidate.gameResult,
      })),
    ).toContainEqual(await matches.findProtocolArchive(matchId))
  })

  test('reads the long-game result without loading Protocol rows and rejects a changed archive retry', async () => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    await matches.beginCreation({ ...catalogInput(), gameKey: 'free-pyramid-long' })
    await matches.activate(matchId)
    const base = finishedMatchTransfer()

    const archive = {
      ...base,
      gameKey: 'free-pyramid-long' as const,
      finalState: { ...base.finalState, gameKey: 'free-pyramid-long' as const },
      gameResult: {
        gameKey: 'free-pyramid-long' as const,
        racks: [{ rackNumber: 1, scoreBySeat: { A: 2, B: 0 } }],
      },
    }

    await matches.archiveFinished(archive)
    await matches.archiveFinished(archive)
    await expect(
      matches.archiveFinished({
        ...archive,
        gameResult: { ...archive.gameResult, racks: [{ rackNumber: 1, scoreBySeat: { A: 1, B: 1 } }] },
      }),
    ).rejects.toThrow(MatchFinalizationError)

    await env.DB.prepare('UPDATE sparring_match_archives SET rows_json = ? WHERE match_id = ?')
      .bind('[', matchId)
      .run()

    expect(await matches.findFinishedArchive(matchId)).toMatchObject({
      state: archive.finalState,
      gameResult: archive.gameResult,
    })
    await expect(matches.findProtocolArchive(matchId)).rejects.toThrow('Protocol archive storage corruption')
  })

  test.each([
    ['malformed JSON', '[', '{}', 1, `Protocol archive storage corruption for match ${matchId}`],
    ['unsupported version', '[]', '{}', 2, `Unsupported protocol archive version 2 for match ${matchId}`],
  ])('reports %s in a persisted archive', async (_label, rowsJson, stateJson, version, message) => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    await seedArchive(rowsJson, stateJson, version)
    await expect(matches.findProtocolArchive(matchId)).rejects.toThrow(message)
  })

  test('rejects a persisted zero source sequence', async () => {
    const matches = new SparringMatchStorage(createApplicationDatabaseClient(env.DB))
    const state = finishedMatchTransfer().finalState
    await seedArchive('[]', JSON.stringify(state), 1, 0)
    await expect(matches.findProtocolArchive(matchId)).rejects.toThrow(
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

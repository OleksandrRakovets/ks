import { D1Client } from '@effect/sql-d1'
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
  type Seat,
  UnixEpochMilliseconds,
  VerifiedPlayerId,
} from '@ks/core'
import { applyD1Migrations, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { sql } from 'drizzle-orm'
import * as DrizzleD1 from 'drizzle-orm/effect-d1'
import { type Config, Context, Effect, Layer, ManagedRuntime, Option, Predicate, Schema } from 'effect'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { ApplicationDatabase } from '../../src/d1/client'
import { guestPlayers, sparringMatches, verifiedPlayers } from '../../src/d1/schema'
import { ApplicationClock } from '../../src/match/clock'
import type { MatchRoomArchiveTransfer } from '../../src/match/match-room'
import { PlayerStorage } from '../../src/player/storage/player-storage'
import { applicationLayer, SparringService } from '../../src/server'
import { MatchFinalizationError } from '../../src/sparring/storage/protocol-archive'
import type { MatchCreationRecord } from '../../src/sparring/storage/records'
import { SparringMatchStorage } from '../../src/sparring/storage/sparring-match-storage'

const matchId = Schema.decodeUnknownSync(MatchId)('01ARZ3NDEKTSV4RRFFQ69G5FAV')

const otherMatchId = Schema.decodeUnknownSync(MatchId)('01ARZ3NDEKTSV4RRFFQ69G5FAW')

const newestMatchId = Schema.decodeUnknownSync(MatchId)('01ARZ3NDEKTSV4RRFFQ69G5FAX')

const creatingMatchId = Schema.decodeUnknownSync(MatchId)('01ARZ3NDEKTSV4RRFFQ69G5FAY')

const seatAPlayerRef = Schema.decodeUnknownSync(PlayerRef)('gp_01HX0000000000000000000000')

const seatBPlayerRef = Schema.decodeUnknownSync(PlayerRef)('gp_01HX0000000000000000000001')

const createdAt = Schema.decodeUnknownSync(UnixEpochMilliseconds)(1_000)

let runtime: ManagedRuntime.ManagedRuntime<
  ApplicationClock | ApplicationDatabase | PlayerStorage | SparringMatchStorage,
  Config.ConfigError
>

let db: ApplicationDatabase['Service']

let players: ReturnType<typeof makePlayerPromises>

let matches: ReturnType<typeof makeMatchPromises>

function makePlayerPromises(service: PlayerStorage['Service']) {
  return {
    ensureGuestRef: (...args: Parameters<typeof service.ensureGuestRef>) =>
      runtime.runPromise(service.ensureGuestRef(...args)),
    readParticipant: (...args: Parameters<typeof service.readParticipant>) =>
      runtime.runPromise(service.readParticipant(...args)),
  }
}

function makeMatchPromises(service: SparringMatchStorage['Service']) {
  return {
    beginCreation: (...args: Parameters<typeof service.beginCreation>) =>
      runtime.runPromise(service.beginCreation(...args)),
    activate: (...args: Parameters<typeof service.activate>) => runtime.runPromise(service.activate(...args)),
    findMatch: (...args: Parameters<typeof service.findMatch>) =>
      runtime.runPromise(service.findMatch(...args)),
    listMatches: (...args: Parameters<typeof service.listMatches>) =>
      runtime.runPromise(service.listMatches(...args)),
    listLive: (...args: Parameters<typeof service.listLive>) => runtime.runPromise(service.listLive(...args)),
    listFinished: (...args: Parameters<typeof service.listFinished>) =>
      runtime.runPromise(service.listFinished(...args)),
    findFinishedTime: (...args: Parameters<typeof service.findFinishedTime>) =>
      runtime.runPromise(service.findFinishedTime(...args)),
    findFinishedArchive: (...args: Parameters<typeof service.findFinishedArchive>) =>
      runtime.runPromise(service.findFinishedArchive(...args)),
    findProtocolArchive: (...args: Parameters<typeof service.findProtocolArchive>) =>
      runtime.runPromise(service.findProtocolArchive(...args)),
    archiveFinished: (...args: Parameters<typeof service.archiveFinished>) =>
      runtime.runPromise(service.archiveFinished(...args)),
    markFinished: (...args: Parameters<typeof service.markFinished>) =>
      runtime.runPromise(service.markFinished(...args)),
  }
}

const createRequest = Schema.decodeUnknownSync(CreateMatchRequest)({
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

function finishedMatchTransfer(
  id = matchId,
  timestamp = createdAt,
  concedingSeat?: typeof Seat.Type,
): MatchRoomArchiveTransfer {
  const config = buildMatchConfig(id, createRequest)
  const session = createMatch(config)
  const acceptedAt = Schema.decodeUnknownSync(UnixEpochMilliseconds)(timestamp + 1_000)
  const protocolEntries: (typeof ProtocolEntry.Type)[] = []
  let acceptedSeq = 0

  for (const command of [
    { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
    {
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'pot.record', seat: concedingSeat ?? 'A', pottedBallCount: concedingSeat ? 1 : 2 },
    },
    concedingSeat
      ? { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: concedingSeat } }
      : { commandId: newCommandId(), source: 'game', command: { type: 'frame.award', seat: 'A' } },
  ] satisfies (typeof MatchCommand.Type)[]) {
    const decision = session.execute(command)

    if (!Predicate.isTagged(decision, 'accepted'))
      throw new Error(`Fixture command rejected: ${command.command.type}`)
    acceptedSeq += 1
    decision.protocolEntryContents.forEach((entry, entryIndex) => {
      protocolEntries.push(
        Schema.decodeUnknownSync(ProtocolEntry)({
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

  const dependencies = Layer.merge(
    ApplicationDatabase.layer(env.DB),
    Layer.succeed(ApplicationClock, new FixedClock(new Date(createdAt), 'Europe/Kyiv')),
  )

  runtime = ManagedRuntime.make(
    Layer.mergeAll(
      dependencies,
      PlayerStorage.layer.pipe(Layer.provide(dependencies)),
      SparringMatchStorage.layer.pipe(Layer.provide(dependencies)),
    ),
  )

  db = await runtime.runPromise(
    Effect.gen(function* () {
      return yield* ApplicationDatabase
    }),
  )
  players = makePlayerPromises(
    await runtime.runPromise(
      Effect.gen(function* () {
        return yield* PlayerStorage
      }),
    ),
  )
  matches = makeMatchPromises(
    await runtime.runPromise(
      Effect.gen(function* () {
        return yield* SparringMatchStorage
      }),
    ),
  )
})

afterEach(async () => {
  await runtime.dispose()
})

describe('real D1 match lifecycle', () => {
  test('creates and reuses guest players through storage', async () => {
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

  test('exposes only SparringService and keeps overlapping request clocks isolated', async () => {
    const timestamp = Schema.decodeUnknownSync(UnixEpochMilliseconds)(Date.parse('2026-09-30T22:30:00Z'))
    await matches.beginCreation(catalogInput(matchId, timestamp))
    await matches.activate(matchId)
    const archive = finishedMatchTransfer(matchId, timestamp)
    await matches.archiveFinished(archive)
    await matches.markFinished(archive)

    const [kyiv, newYork] = await Promise.all(
      ['Europe/Kyiv', 'America/New_York'].map((timeZone) =>
        Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const services = yield* Layer.build(
                applicationLayer(
                  {
                    DB: env.DB,
                    MATCH_ROOM: {
                      getByName: () => {
                        throw new Error('Finished lists must not select MatchRoom')
                      },
                    },
                  },
                  new FixedClock(new Date('2026-10-01T12:00:00Z'), timeZone),
                ),
              )

              expect(Option.isNone(Context.getOption(services, ApplicationDatabase))).toBe(true)
              expect(Option.isNone(Context.getOption(services, ApplicationClock))).toBe(true)
              expect(Option.isNone(Context.getOption(services, PlayerStorage))).toBe(true)
              expect(Option.isNone(Context.getOption(services, SparringMatchStorage))).toBe(true)
              const runEffect = Effect.runPromiseWith(services)

              return yield* Effect.promise(() =>
                runEffect(SparringService.use((sparring) => sparring.listFinishedMatches('en'))),
              )
            }),
          ),
        ),
      ),
    )

    expect(kyiv).toMatchObject({ day: '2026-10-01', isToday: true, matches: [{ matchId }] })
    expect(newYork).toMatchObject({ day: '2026-09-30', isToday: false, matches: [{ matchId }] })
  })

  test('creates, lists, archives, and finishes a match idempotently', async () => {
    const input = catalogInput()
    await matches.beginCreation(input)
    await matches.beginCreation(input)
    await expect(matches.beginCreation({ ...input, gameKey: 'combined-pyramid' })).rejects.toThrow(
      'Match row conflicts with room creation',
    )
    await matches.activate(matchId)

    const otherCreatedAt = Schema.decodeUnknownSync(UnixEpochMilliseconds)(3_000)
    await matches.beginCreation(catalogInput(otherMatchId, otherCreatedAt))
    await matches.activate(otherMatchId)
    const otherArchive = finishedMatchTransfer(otherMatchId, otherCreatedAt)
    await matches.archiveFinished(otherArchive)
    await matches.markFinished(otherArchive)
    await matches.beginCreation(
      catalogInput(newestMatchId, Schema.decodeUnknownSync(UnixEpochMilliseconds)(4_000)),
    )
    await matches.activate(newestMatchId)
    await matches.beginCreation(
      catalogInput(creatingMatchId, Schema.decodeUnknownSync(UnixEpochMilliseconds)(5_000)),
    )

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

    expect(
      (await matches.listLive(Schema.decodeUnknownSync(UnixEpochMilliseconds)(0))).map((row) => row.matchId),
    ).toEqual([newestMatchId, matchId, otherMatchId])

    const archive = {
      ...finishedMatchTransfer(),
      endedAt: Schema.decodeUnknownSync(UnixEpochMilliseconds)(4_500),
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
          end: Schema.decodeUnknownSync(UnixEpochMilliseconds)(4_000),
        })
      ).map((row) => row.matchId),
    ).toEqual([otherMatchId, matchId])
    expect(
      await matches.findFinishedTime({ before: Schema.decodeUnknownSync(UnixEpochMilliseconds)(3_000) }),
    ).toBe(createdAt)
    expect(
      await matches.findFinishedTime({ from: Schema.decodeUnknownSync(UnixEpochMilliseconds)(2_000) }),
    ).toBe(3_000)
    expect(
      (await matches.listLive(Schema.decodeUnknownSync(UnixEpochMilliseconds)(3_000))).map(
        (row) => row.matchId,
      ),
    ).toEqual([newestMatchId, matchId, otherMatchId])

    const result = await Effect.runPromise(
      SparringService.use((sparring) => sparring.readMatch(matchId, 'en', 'free-pyramid')).pipe(
        Effect.provide(
          applicationLayer(
            {
              DB: env.DB,
              MATCH_ROOM: {
                getByName: () => {
                  throw new Error('Finished reads must not select MatchRoom')
                },
              },
            },
            new FixedClock(new Date(createdAt), 'Europe/Kyiv'),
          ),
        ),
      ),
    )

    expect(result).toMatchObject({
      lifecycle: 'finished',
      matchId,
      gameKey: 'free-pyramid',
      winnerSeat: 'A',
      framesWonBySeat: { A: 1, B: 0 },
      representedFrame: { frameIndex: 1, pointsBySeat: { A: 2, B: 0 } },
    })
  })

  test('rejects unmigrated archives and scores instead of inferring winners on reads or retries', async () => {
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
    await expect(matches.findMatch(matchId)).rejects.toThrow()
    await expect(matches.listFinished({ start: createdAt, end: archive.endedAt })).rejects.toThrow()
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

  test('lists a crowded finished-match day with localized guest and verified names and missing-player fallback', async () => {
    const verifiedRef = Schema.decodeUnknownSync(PlayerRef)('vp_01HX0000000000000000000002')
    const missingRef = Schema.decodeUnknownSync(PlayerRef)('gp_01HX0000000000000000000003')

    await runtime.runPromise(
      db.insert(guestPlayers).values({
        guestPlayerId: Schema.decodeUnknownSync(GuestPlayerId)(seatAPlayerRef.slice(3)),
        firstNameUk: 'Галя',
        lastNameUk: 'Гість',
        firstNameEn: 'Gina',
        lastNameEn: 'Guest',
        createdAt,
      }),
    )
    await runtime.runPromise(
      db.insert(verifiedPlayers).values({
        verifiedPlayerId: Schema.decodeUnknownSync(VerifiedPlayerId)(verifiedRef.slice(3)),
        firstNameUk: 'Віра',
        lastNameUk: 'Тест',
        firstNameEn: 'Vera',
        lastNameEn: 'Verified',
        createdAt,
      }),
    )

    const score = JSON.stringify(projectMatchScore(finishedMatchTransfer().finalState))

    const rows = Array.from({ length: 26 }, (_, index) => ({
      matchId: Schema.decodeUnknownSync(MatchId)(`${matchId.slice(0, 24)}${String(index).padStart(2, '0')}`),
      gameKey: 'free-pyramid' as const,
      status: 'finished' as const,
      createdAt: Schema.decodeUnknownSync(UnixEpochMilliseconds)(createdAt + index),
      endedAt: Schema.decodeUnknownSync(UnixEpochMilliseconds)(createdAt + 1_000 + index),
      seatAPlayerRef: index % 2 ? verifiedRef : seatAPlayerRef,
      seatBPlayerRef: index === 0 ? missingRef : index % 2 ? seatAPlayerRef : verifiedRef,
      finalSourceLatestSeq: 4,
      finalScoreJson: score,
    }))

    for (const row of rows) await runtime.runPromise(db.insert(sparringMatches).values(row))

    const range = { start: createdAt, end: Schema.decodeUnknownSync(UnixEpochMilliseconds)(createdAt + 26) }
    const records = await matches.listFinished(range)
    expect(records.map((row) => row.matchId)).toEqual(rows.map((row) => row.matchId).reverse())

    const [uk, en] = await Effect.runPromise(
      SparringService.use((sparring) =>
        Effect.gen(function* () {
          const uk = yield* sparring.listFinishedMatches('uk', '1970-01-01')
          const en = yield* sparring.listFinishedMatches('en', '1970-01-01')

          return [uk.matches, en.matches] as const
        }),
      ).pipe(
        Effect.provide(
          applicationLayer(
            {
              DB: env.DB,
              MATCH_ROOM: {
                getByName: () => {
                  throw new Error('Finished lists must not select MatchRoom')
                },
              },
            },
            new FixedClock(new Date(createdAt), 'Europe/Kyiv'),
          ),
        ),
      ),
    )

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
    expect(await players.readParticipant(verifiedRef)).toEqual(records[0]?.participants.A)
    expect(await players.readParticipant(missingRef)).toEqual(records[25]?.participants.B)
    expect(
      (await matches.listLive(Schema.decodeUnknownSync(UnixEpochMilliseconds)(0))).map((row) => row.matchId),
    ).toEqual(rows.map((row) => row.matchId).reverse())
  })

  test('rejects conflicting persisted archive data without changing the active match row', async () => {
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
    await matches.beginCreation(catalogInput())
    await matches.activate(matchId)
    const first = finishedMatchTransfer()
    const conflictingTimestamp = Schema.decodeUnknownSync(UnixEpochMilliseconds)(first.endedAt + 1)

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
    await seedArchive(rowsJson, stateJson, version)
    await expect(matches.findProtocolArchive(matchId)).rejects.toThrow(message)
  })

  test('rejects a persisted zero source sequence', async () => {
    const state = finishedMatchTransfer().finalState
    await seedArchive('[]', JSON.stringify(state), 1, 0)
    await expect(matches.findProtocolArchive(matchId)).rejects.toThrow(
      `Protocol archive storage corruption for match ${matchId}`,
    )
  })
})

test('native Effect D1 queries preserve empty results and typed SQL failures', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* DrizzleD1.makeWithDefaults({})
      expect(yield* db.select().from(sparringMatches).get()).toBeUndefined()

      const failure = yield* Effect.flip(db.run(sql`SELECT FROM`))
      expect(failure._tag).toBe('EffectDrizzleQueryError')
      expect(failure.query).toBe('SELECT FROM')
    }).pipe(Effect.provide(D1Client.layer({ db: env.DB }))),
  )
})

test('storage and public Sparring failures retain SQL diagnostics in the application error channel', async () => {
  await env.DB.exec('DROP TABLE guest_players; DROP TABLE sparring_matches;')

  const playerFailure = await runtime.runPromise(
    PlayerStorage.use((players) =>
      Effect.flip(players.ensureGuestRef({ firstName: 'Storage', lastName: 'Failure' })),
    ),
  )

  expect(playerFailure).toHaveProperty('_tag', 'ApplicationStorageError')
  expect(playerFailure).toHaveProperty('cause._tag', 'EffectDrizzleQueryError')

  const matchFailure = await Effect.runPromise(
    SparringService.use((sparring) => Effect.flip(sparring.readMatch(matchId, 'en', 'free-pyramid'))).pipe(
      Effect.provide(
        applicationLayer(
          {
            DB: env.DB,
            MATCH_ROOM: {
              getByName: () => {
                throw new Error('Failed catalog reads must not select MatchRoom')
              },
            },
          },
          new FixedClock(new Date(createdAt), 'Europe/Kyiv'),
        ),
      ),
    ),
  )

  expect(matchFailure).toHaveProperty('_tag', 'ApplicationStorageError')
  expect(matchFailure).toHaveProperty('cause._tag', 'EffectDrizzleQueryError')
})

describe('D1 match-winner backfill', () => {
  beforeEach(async () => {
    const index = env.TEST_MIGRATIONS.findIndex((migration) =>
      migration.name.includes('backfill-match-winners'),
    )

    if (index < 0) throw new Error('Missing winner backfill migration')
    await reset()
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, index))
  })

  test.each([
    ['A', 'B', { A: 0, B: 1 }, { A: 1, B: 0 }],
    ['B', 'A', { A: 1, B: 0 }, { A: 0, B: 1 }],
  ] as const)(
    'backfills winner %s despite a point-leading conceder',
    async (winnerSeat, concedingSeat, points, frames) => {
      const archive = finishedMatchTransfer(matchId, createdAt, concedingSeat)
      await seedLegacyFinishedMatch(archive)
      await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

      const expectedScore = {
        matchTargetFrames: 1,
        frameTargetPointsBySeat: { A: 2, B: 2 },
        framesWonBySeat: frames,
        winnerSeat,
        singleFramePointsBySeat: points,
        activeFrame: null,
      }

      expect(await matches.findFinishedArchive(matchId)).toMatchObject({ state: archive.finalState })
      expect(await matches.findProtocolArchive(matchId)).toMatchObject({
        state: { winnerSeat },
        entries: JSON.parse(JSON.stringify(archive.protocolEntries)),
      })
      expect(await matches.findMatch(matchId)).toMatchObject({ finalScore: expectedScore })
      expect(await matches.listFinished({ start: createdAt, end: archive.endedAt })).toMatchObject([
        { finalScore: expectedScore },
      ])
      expect(
        await env.DB.prepare('SELECT final_score_json FROM sparring_matches WHERE match_id = ?')
          .bind(matchId)
          .first('final_score_json'),
      ).toBe(JSON.stringify(expectedScore))
      await matches.archiveFinished(archive)
      await matches.markFinished(archive)
      await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
      expect(await matches.findMatch(matchId)).toMatchObject({ finalScore: expectedScore })
    },
  )

  test('preserves an explicit winner and rebuilds multi-frame scores without single-frame points', async () => {
    const base = finishedMatchTransfer()

    const archive = {
      ...base,
      finalState: {
        ...base.finalState,
        targets: { frameTargetPointsBySeat: { A: 8, B: 7 }, matchTargetFrames: 3 },
        framesWonBySeat: { A: 3, B: 0 },
        status: 'finished' as const,
        winnerSeat: 'B' as const,
      },
    }

    await matches.beginCreation(catalogInput())
    await matches.activate(matchId)
    await matches.archiveFinished(archive)
    await matches.markFinished(archive)
    const originalStateJson = JSON.stringify(archive.finalState)
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
    expect(
      await env.DB.prepare('SELECT state_json FROM sparring_match_archives WHERE match_id = ?')
        .bind(matchId)
        .first('state_json'),
    ).toBe(originalStateJson)
    expect(await matches.findMatch(matchId)).toMatchObject({
      finalScore: {
        matchTargetFrames: 3,
        frameTargetPointsBySeat: { A: 8, B: 7 },
        framesWonBySeat: { A: 3, B: 0 },
        winnerSeat: 'B',
        singleFramePointsBySeat: null,
        activeFrame: null,
      },
    })
    await matches.archiveFinished(archive)
    await matches.markFinished(archive)
  })

  test.each([
    ['unfinished matches', "UPDATE sparring_matches SET status = 'active' WHERE match_id = ?"],
    ['missing archives', 'DELETE FROM sparring_match_archives WHERE match_id = ?'],
    [
      'contradictory outcomes',
      "UPDATE sparring_match_archives SET rows_json = json_set(rows_json, '$[#-1].seat', 'B') WHERE match_id = ?",
    ],
    [
      'missing outcomes',
      "UPDATE sparring_match_archives SET rows_json = json_remove(rows_json, '$[#-1]') WHERE match_id = ?",
    ],
    [
      'duplicate outcomes',
      "UPDATE sparring_match_archives SET rows_json = json_insert(rows_json, '$[#]', json_extract(rows_json, '$[#-1]')) WHERE match_id = ?",
    ],
    [
      'explicit null winners',
      "UPDATE sparring_match_archives SET state_json = json_set(state_json, '$.winnerSeat', NULL) WHERE match_id = ?",
    ],
    ['malformed archives', "UPDATE sparring_match_archives SET state_json = '[' WHERE match_id = ?"],
  ])('rejects %s without partially changing any data', async (_label, corruptionSql) => {
    await seedLegacyFinishedMatch(finishedMatchTransfer())
    await seedLegacyFinishedMatch(finishedMatchTransfer(otherMatchId))
    await env.DB.prepare(corruptionSql).bind(otherMatchId).run()

    const originalArchives = (
      await env.DB.prepare('SELECT * FROM sparring_match_archives ORDER BY match_id').all()
    ).results

    const originalMatches = (await env.DB.prepare('SELECT * FROM sparring_matches ORDER BY match_id').all())
      .results

    await expect(applyD1Migrations(env.DB, env.TEST_MIGRATIONS)).rejects.toThrow()
    expect(
      (await env.DB.prepare('SELECT * FROM sparring_match_archives ORDER BY match_id').all()).results,
    ).toEqual(originalArchives)
    expect((await env.DB.prepare('SELECT * FROM sparring_matches ORDER BY match_id').all()).results).toEqual(
      originalMatches,
    )
    expect(
      await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE name = '__match_winner_backfill_guard'",
      ).first(),
    ).toBeNull()
  })
})

async function seedLegacyFinishedMatch(archive: MatchRoomArchiveTransfer): Promise<void> {
  await matches.beginCreation(catalogInput(archive.matchId, archive.createdAt))
  await matches.activate(archive.matchId)
  await matches.archiveFinished(archive)
  await matches.markFinished(archive)
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE sparring_match_archives SET state_json = json_remove(state_json, '$.winnerSeat') WHERE match_id = ?",
    ).bind(archive.matchId),
    env.DB.prepare(
      "UPDATE sparring_matches SET final_score_json = json_remove(final_score_json, '$.winnerSeat') WHERE match_id = ?",
    ).bind(archive.matchId),
  ])
}

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

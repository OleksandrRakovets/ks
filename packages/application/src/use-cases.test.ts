import { describe, expect, test } from 'bun:test'

import type { MatchSnapshotFor } from '@ks/competition'
import {
  type ControlCommand,
  FactIdSchema,
  MatchIdSchema,
  MatchSnapshotSchema,
  newCommandId,
  PlayerRefSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import { type ControlProjectionFor, listGameKeys, type RegisteredGameKey } from '@ks/gameplay/definitions'
import { createInitialGameState, deriveGameControl } from '@ks/gameplay/server'
import * as v from 'valibot'

import type { MatchRoomCreateRequest, MatchRoomSnapshotResult } from './match-room-client'
import { ProtocolArchiveCorruptionError, type ProtocolArchiveRecord, UnsupportedProtocolArchiveVersionError } from './protocol'
import { createApplicationWithDependencies } from './use-cases'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const controlSecret = 'control-secret-1234567890'
const playerRefA = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')
const playerRefB = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB')
const factId = v.parse(FactIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAC')

function snapshotFor<K extends RegisteredGameKey>(gameKey: K, status: 'active' | 'finished' = 'active'): MatchSnapshotFor<K> {
  return {
    matchId,
    gameKey,
    targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 3 },
    status,
    currentFrameIndex: 1,
    framesWonBySeat: { A: 0, B: 0 },
    frames: [{ frameIndex: 1, pointsBySeat: { A: 0, B: 0 }, breakerSeat: 'A' }],
    latestSeq: 2,
  }
}

const controlProjections = {
  'strila-v2': deriveGameControl(
    'strila-v2',
    createInitialGameState('strila-v2', { targetPointsBySeat: { A: 9, B: 9 }, breakerSeat: 'A' }),
  ),
  'free-pyramid': deriveGameControl(
    'free-pyramid',
    createInitialGameState('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' }),
  ),
  'free-pyramid-long': deriveGameControl(
    'free-pyramid-long',
    createInitialGameState('free-pyramid-long', {
      targetPointsBySeat: { A: 30, B: 30 },
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: 14 },
    }),
  ),
  'combined-pyramid': deriveGameControl(
    'combined-pyramid',
    createInitialGameState('combined-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' }),
  ),
  'combined-pyramid-old': deriveGameControl(
    'combined-pyramid-old',
    createInitialGameState('combined-pyramid-old', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' }),
  ),
} satisfies { [K in RegisteredGameKey]: ControlProjectionFor<K> }

function activeRoomSnapshot(gameKey: RegisteredGameKey) {
  const controlSections = controlProjections[gameKey].details.commandSections
  switch (gameKey) {
    case 'strila-v2':
      return {
        ok: true as const,
        snapshot: snapshotFor(gameKey),
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
    case 'free-pyramid':
      return {
        ok: true as const,
        snapshot: snapshotFor(gameKey),
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
    case 'free-pyramid-long':
      return {
        ok: true as const,
        snapshot: snapshotFor(gameKey),
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
    case 'combined-pyramid':
      return {
        ok: true as const,
        snapshot: snapshotFor(gameKey),
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
    case 'combined-pyramid-old':
      return {
        ok: true as const,
        snapshot: snapshotFor(gameKey),
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
  }
}

type UnsafeRoomSnapshotMock = {
  ok: true
  snapshot: object
  controlProjection: object | undefined
  controlSections: object
}

function unsafeRoomSnapshot(value: UnsafeRoomSnapshotMock): MatchRoomSnapshotResult {
  // SAFETY: Tests use this single boundary to model malformed external RPC data that violates the advertised contract.
  return value as MatchRoomSnapshotResult
}

function applicationForActiveGame(
  catalogGameKey: RegisteredGameKey,
  roomGameKey = catalogGameKey,
  roomSnapshot: MatchRoomSnapshotResult = activeRoomSnapshot(roomGameKey),
) {
  return createApplicationWithDependencies({
    newMatchId: unused,
    newControlSecret: unused,
    now: unused,
    getOrCreateGuestPlayerRef: unused,
    hydrateParticipant: async (playerRef) => ({ playerRef, displayName: playerRef, shortDisplayName: playerRef }),
    listMatchRecords: unused,
    getMatchRecord: async () => ({
      matchId,
      gameKey: catalogGameKey,
      status: 'active',
      createdAt: v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000),
      participantRefs: { A: playerRefA, B: playerRefB },
    }),
    getProtocolArchive: unused,
    beginMatchCreation: unused,
    activateMatch: unused,
    archiveCompletedMatch: unused,
    finishCompletedMatch: unused,
    matchRoom: {
      create: unused,
      snapshot: async () => roomSnapshot,
      command: unused,
      facts: async () => ({ ok: true as const, facts: [] }),
      stream: unused,
      finalization: unused,
      disposeFinalized: unused,
    },
  })
}

function applicationForArchivedGame(
  catalogGameKey: RegisteredGameKey,
  snapshotGameKey = catalogGameKey,
  archivedSnapshot: MatchSnapshotFor<RegisteredGameKey> = snapshotFor(snapshotGameKey, 'finished'),
  archiveRead?: () => Promise<ProtocolArchiveRecord | null>,
) {
  return createApplicationWithDependencies({
    newMatchId: unused,
    newControlSecret: unused,
    now: unused,
    getOrCreateGuestPlayerRef: unused,
    hydrateParticipant: async (playerRef) => ({ playerRef, displayName: playerRef, shortDisplayName: playerRef }),
    listMatchRecords: unused,
    getMatchRecord: async () => ({
      matchId,
      gameKey: catalogGameKey,
      status: 'finished',
      createdAt: v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000),
      participantRefs: { A: playerRefA, B: playerRefB },
    }),
    getProtocolArchive:
      archiveRead ??
      (async () => ({
        sourceLatestSeq: archivedSnapshot.latestSeq,
        protocolVersion: 1,
        rows: [],
        snapshot: archivedSnapshot,
      })),
    beginMatchCreation: unused,
    activateMatch: unused,
    archiveCompletedMatch: unused,
    finishCompletedMatch: unused,
    matchRoom: {
      create: unused,
      snapshot: unused,
      command: unused,
      facts: unused,
      stream: unused,
      finalization: unused,
      disposeFinalized: unused,
    },
  })
}

function unused(): never {
  throw new Error('Unexpected dependency call')
}

function applicationForInvalidCreation() {
  return createApplicationWithDependencies({
    newMatchId: unused,
    newControlSecret: unused,
    now: unused,
    getOrCreateGuestPlayerRef: unused,
    hydrateParticipant: unused,
    listMatchRecords: unused,
    getMatchRecord: unused,
    getProtocolArchive: unused,
    beginMatchCreation: unused,
    activateMatch: unused,
    archiveCompletedMatch: unused,
    finishCompletedMatch: unused,
    matchRoom: {
      create: unused,
      snapshot: unused,
      command: unused,
      facts: unused,
      stream: unused,
      finalization: unused,
      disposeFinalized: unused,
    },
  })
}

describe('application orchestration', () => {
  test('returns a game-keyed active control and protocol result for every registered game', async () => {
    for (const gameKey of listGameKeys()) {
      const application = applicationForActiveGame(gameKey)
      const control = await application.readMatchControl(matchId, 'en', gameKey)
      expect(control.ok).toBe(true)
      if (!control.ok || control.state !== 'frame-active') throw new Error('Expected active frame')
      expect(control.snapshot.gameKey).toBe(gameKey)
      expect(control.controlProjection.gameKey).toBe(gameKey)

      const protocol = await application.readMatchProtocol(matchId, 'UTC', 'en', gameKey)
      expect(protocol.ok).toBe(true)
      if (!protocol.ok) throw new Error('Expected protocol')
      expect(protocol.snapshot.gameKey).toBe(gameKey)
      expect(protocol.controlProjection?.gameKey).toBe(gameKey)
    }
  })

  test('hides a match when the expected game key does not match the catalog', async () => {
    const application = applicationForActiveGame('free-pyramid')
    expect(await application.readMatchControl(matchId, 'en', 'combined-pyramid')).toEqual({
      ok: false,
      error: 'Unknown match',
      status: 404,
    })
  })

  test('hides a match when the room snapshot key does not match the expected game key', async () => {
    const application = applicationForActiveGame('free-pyramid', 'combined-pyramid')
    expect(await application.readMatchControl(matchId, 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: 'Unknown match',
      status: 404,
    })
    expect(await application.readMatchProtocol(matchId, 'UTC', 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: 'Unknown match',
      status: 404,
    })
  })

  test('rejects mismatched and malformed control projections from the room boundary', async () => {
    const valid = activeRoomSnapshot('free-pyramid')
    const mismatched = unsafeRoomSnapshot({ ...valid, controlProjection: controlProjections['combined-pyramid'] })
    expect(
      await applicationForActiveGame('free-pyramid', 'free-pyramid', mismatched).readMatchControl(
        matchId,
        'en',
        'free-pyramid',
      ),
    ).toEqual({
      ok: false,
      error: 'Invalid room control projection',
      status: 502,
    })
    const malformed = {
      gameKey: 'free-pyramid',
      projection: 'control',
      score: { A: 0, B: 0 },
      details: {},
    }
    expect(
      await applicationForActiveGame(
        'free-pyramid',
        'free-pyramid',
        unsafeRoomSnapshot({ ...valid, controlProjection: malformed }),
      ).readMatchControl(matchId, 'en', 'free-pyramid'),
    ).toEqual({
      ok: false,
      error: 'Invalid room control projection',
      status: 502,
    })
  })

  test('rejects a malformed room snapshot before key or projection narrowing', async () => {
    const valid = activeRoomSnapshot('free-pyramid')
    const malformed = unsafeRoomSnapshot({
      ...valid,
      snapshot: { ...valid.snapshot, latestSeq: 'not-a-sequence' },
    })
    expect(
      await applicationForActiveGame('free-pyramid', 'free-pyramid', malformed).readMatchControl(matchId, 'en', 'free-pyramid'),
    ).toEqual({
      ok: false,
      error: 'Invalid room snapshot',
      status: 502,
    })
  })

  test('rejects missing projection for an unfinished active frame', async () => {
    const valid = activeRoomSnapshot('free-pyramid')
    const contradictory: MatchRoomSnapshotResult = { ...valid, controlProjection: undefined }
    expect(
      await applicationForActiveGame('free-pyramid', 'free-pyramid', contradictory).readMatchControl(
        matchId,
        'en',
        'free-pyramid',
      ),
    ).toEqual({ ok: false, error: 'Inconsistent room control lifecycle', status: 502 })
  })

  test('rejects a projection between frames', async () => {
    const valid = activeRoomSnapshot('free-pyramid')
    const latestFrame = valid.snapshot.frames[0]
    if (!latestFrame) throw new Error('Expected frame fixture')
    const contradictory = unsafeRoomSnapshot({
      ...valid,
      snapshot: {
        ...valid.snapshot,
        frames: [{ ...latestFrame, winnerSeat: 'A' }],
      },
    })
    expect(
      await applicationForActiveGame('free-pyramid', 'free-pyramid', contradictory).readMatchControl(
        matchId,
        'en',
        'free-pyramid',
      ),
    ).toEqual({ ok: false, error: 'Inconsistent room control lifecycle', status: 502 })
  })

  test('accepts the legitimate active pre-first-frame state without a projection', async () => {
    const valid = activeRoomSnapshot('free-pyramid')
    const preFirstFrame = unsafeRoomSnapshot({
      ...valid,
      snapshot: { ...valid.snapshot, currentFrameIndex: 0, frames: [] },
      controlProjection: undefined,
    })
    const result = await applicationForActiveGame('free-pyramid', 'free-pyramid', preFirstFrame).readMatchControl(
      matchId,
      'en',
      'free-pyramid',
    )
    expect(result.ok && result.state).toBe('between-frames')
    const protocol = await applicationForActiveGame('free-pyramid', 'free-pyramid', preFirstFrame).readMatchProtocol(
      matchId,
      'UTC',
      'en',
      'free-pyramid',
    )
    expect(protocol.ok && protocol.controlProjection).toBeUndefined()
  })

  test('hides archived protocol when the archived snapshot key does not match the expected game', async () => {
    const application = applicationForArchivedGame('free-pyramid', 'combined-pyramid')
    expect(await application.readMatchProtocol(matchId, 'UTC', 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: 'Unknown match',
      status: 404,
    })
  })

  test('rejects active and otherwise non-terminal archived snapshots', async () => {
    const active = applicationForArchivedGame('free-pyramid', 'free-pyramid', snapshotFor('free-pyramid', 'active'))
    expect(await active.readMatchProtocol(matchId, 'UTC', 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: 'Failed to parse completed match snapshot',
      status: 500,
    })

    const unfinished = applicationForArchivedGame('free-pyramid', 'free-pyramid')
    expect(await unfinished.readMatchControl(matchId, 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: 'Failed to parse completed match snapshot',
      status: 500,
    })
  })

  test.each([
    ['archive corruption', () => new ProtocolArchiveCorruptionError(matchId), 'Protocol archive corruption'],
    [
      'unsupported archive version',
      () => new UnsupportedProtocolArchiveVersionError(matchId, 2),
      'Unsupported protocol archive version',
    ],
  ])('converts %s into declared failures for completed snapshots and protocol rows', async (_label, error, expectedError) => {
    const controlApplication = applicationForArchivedGame(
      'free-pyramid',
      'free-pyramid',
      snapshotFor('free-pyramid', 'finished'),
      async () => {
        throw error()
      },
    )
    expect(await controlApplication.readMatchControl(matchId, 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: expectedError,
      status: 500,
    })

    const terminalSnapshot: MatchSnapshotFor<'free-pyramid'> = {
      ...v.parse(MatchSnapshotSchema, {
        matchId,
        gameKey: 'free-pyramid',
        targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
        status: 'finished',
        currentFrameIndex: 1,
        framesWonBySeat: { A: 1, B: 0 },
        frames: [{ frameIndex: 1, pointsBySeat: { A: 8, B: 3 }, breakerSeat: 'A', winnerSeat: 'A' }],
        latestSeq: 9,
      }),
      gameKey: 'free-pyramid',
    }
    const archive: ProtocolArchiveRecord = {
      sourceLatestSeq: 9,
      protocolVersion: 1,
      rows: [],
      snapshot: terminalSnapshot,
    }
    let reads = 0
    const protocolApplication = applicationForArchivedGame('free-pyramid', 'free-pyramid', terminalSnapshot, async () => {
      reads += 1
      if (reads === 1) return archive
      throw error()
    })
    expect(await protocolApplication.readMatchProtocol(matchId, 'UTC', 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: expectedError,
      status: 500,
    })
  })

  test('creates both guest players before creating the room with generated credentials', async () => {
    const createdAt = v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000)
    const lifecycle: unknown[] = []
    const playerNames: string[] = []
    let roomRequest: MatchRoomCreateRequest | undefined
    const room = {
      async create(request: MatchRoomCreateRequest) {
        lifecycle.push(['room', request.createdAt])
        roomRequest = request
        return { ok: true as const, matchId }
      },
      snapshot: unused,
      command: unused,
      facts: unused,
      stream: unused,
      finalization: unused,
      disposeFinalized: unused,
    }
    const application = createApplicationWithDependencies({
      newMatchId: () => matchId,
      newControlSecret: () => controlSecret,
      now: () => createdAt,
      getOrCreateGuestPlayerRef: async (displayName) => {
        playerNames.push(displayName)
        return displayName === 'Alice Smith' ? playerRefA : playerRefB
      },
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchRecord: unused,
      getProtocolArchive: unused,
      beginMatchCreation: async (input) => {
        lifecycle.push(['begin', input.createdAt])
      },
      activateMatch: async (id) => {
        lifecycle.push(['activate', id])
      },
      archiveCompletedMatch: unused,
      finishCompletedMatch: unused,
      matchRoom: room,
    })

    const result = await application.createMatch({
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 9 }, matchTargetFrames: 3 },
      firstBreakerSeat: 'B',
      playerNames: { A: '  Alice   Smith ', B: ' Bob Jones ' },
    })

    expect(result).toEqual({ ok: true, matchId })
    expect(playerNames).toEqual(['Alice Smith', 'Bob Jones'])
    expect(roomRequest).toEqual({
      matchId,
      controlSecret,
      createdAt,
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 9 }, matchTargetFrames: 3 },
      firstBreakerSeat: 'B',
      participants: [
        { seat: 'A', playerRef: playerRefA },
        { seat: 'B', playerRef: playerRefB },
      ],
    })
    expect(lifecycle).toEqual([
      ['begin', createdAt],
      ['room', createdAt],
      ['activate', matchId],
    ])
  })

  test('rejects a zero target before player or catalog writes', async () => {
    expect(
      await applicationForInvalidCreation().createMatch({
        gameKey: 'free-pyramid',
        targets: { frameTargetPointsBySeat: { A: 0, B: 8 }, matchTargetFrames: 3 },
        firstBreakerSeat: 'A',
        playerNames: { A: 'Alice', B: 'Bob' },
      }),
    ).toEqual({ ok: false, error: 'Invalid match creation input', status: 400 })
  })

  test('rejects duplicate normalized names before player or catalog writes', async () => {
    expect(
      await applicationForInvalidCreation().createMatch({
        gameKey: 'free-pyramid',
        targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 3 },
        firstBreakerSeat: 'A',
        playerNames: { A: ' Alice ', B: 'Alice' },
      }),
    ).toEqual({ ok: false, error: 'Invalid match creation input', status: 400 })
  })

  test('rejects names that cannot produce canonical hydrated short names before side effects', async () => {
    expect(
      await applicationForInvalidCreation().createMatch({
        gameKey: 'free-pyramid',
        targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 3 },
        firstBreakerSeat: 'A',
        playerNames: { A: `A ${'x'.repeat(126)}`, B: 'Bob' },
      }),
    ).toEqual({ ok: false, error: 'Invalid match creation input', status: 400 })
  })

  test('submits commands to the selected room without a control secret', async () => {
    const command: ControlCommand = { source: 'match', commandType: 'frame.start', command: {} }
    const calls: unknown[][] = []
    const room = {
      create: unused,
      snapshot: unused,
      async command(matchId: string, commandId: string, command: ControlCommand) {
        calls.push([matchId, commandId, command])
        return { ok: true as const, accepted: [{ seq: 3, factId }] }
      },
      facts: unused,
      stream: unused,
      finalization: unused,
      disposeFinalized: unused,
    }
    const application = createApplicationWithDependencies({
      newMatchId: unused,
      newControlSecret: unused,
      now: unused,
      getOrCreateGuestPlayerRef: unused,
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchRecord: async () => ({
        matchId,
        gameKey: 'free-pyramid',
        status: 'active',
        createdAt: v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000),
        participantRefs: { A: playerRefA, B: playerRefB },
      }),
      getProtocolArchive: unused,
      beginMatchCreation: unused,
      activateMatch: unused,
      archiveCompletedMatch: unused,
      finishCompletedMatch: unused,
      matchRoom: room,
    })

    const commandId = newCommandId()
    expect(await application.commandMatch(matchId, commandId, command, 'combined-pyramid')).toEqual({
      ok: false,
      error: 'Unknown match',
      status: 404,
    })
    expect(calls).toEqual([])
    const result = await application.commandMatch(matchId, commandId, command, 'free-pyramid')

    expect(result).toEqual({ ok: true, accepted: [{ seq: 3, factId }] })
    expect(calls).toEqual([[matchId, commandId, command]])
  })

  test('reads a finished match entirely from its D1 archive', async () => {
    const snapshot = v.parse(MatchSnapshotSchema, {
      matchId,
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
      status: 'finished',
      currentFrameIndex: 1,
      framesWonBySeat: { A: 1, B: 0 },
      frames: [{ frameIndex: 1, pointsBySeat: { A: 8, B: 3 }, breakerSeat: 'A', winnerSeat: 'A' }],
      latestSeq: 9,
    })
    const room = {
      create: unused,
      snapshot: unused,
      command: unused,
      facts: unused,
      stream: unused,
      finalization: unused,
      disposeFinalized: unused,
    }
    const application = createApplicationWithDependencies({
      newMatchId: unused,
      newControlSecret: unused,
      now: unused,
      getOrCreateGuestPlayerRef: unused,
      hydrateParticipant: async (playerRef) => ({
        playerRef,
        displayName: playerRef === playerRefA ? 'Alice Smith' : 'Bob Jones',
        shortDisplayName: playerRef === playerRefA ? 'Alice' : 'Bob',
      }),
      listMatchRecords: unused,
      getMatchRecord: async () => ({
        matchId,
        gameKey: 'free-pyramid',
        status: 'finished',
        createdAt: v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000),
        participantRefs: { A: playerRefA, B: playerRefB },
      }),
      getProtocolArchive: async () => ({
        sourceLatestSeq: 9,
        protocolVersion: 1,
        rows: [],
        snapshot,
      }),
      beginMatchCreation: unused,
      activateMatch: unused,
      archiveCompletedMatch: unused,
      finishCompletedMatch: unused,
      matchRoom: room,
    })

    const result = await application.readMatchControl(matchId, 'en', 'free-pyramid')

    expect(result).toEqual({
      ok: true,
      state: 'between-frames',
      snapshot: { ...snapshot, gameKey: 'free-pyramid' },
      controlSections: {
        neutral: [],
        primary: { A: [], B: [] },
        secondary: { A: [], B: [] },
        tertiary: { A: [], B: [] },
      },
      participants: {
        A: { playerRef: playerRefA, displayName: 'Alice Smith', shortDisplayName: 'Alice' },
        B: { playerRef: playerRefB, displayName: 'Bob Jones', shortDisplayName: 'Bob' },
      },
    })
    const protocol = await application.readMatchProtocol(matchId, 'UTC', 'en', 'free-pyramid')
    expect(protocol.ok && protocol.snapshot.gameKey).toBe('free-pyramid')
    expect(protocol.ok && protocol.controlProjection).toBeUndefined()
    expect(
      await application.commandMatch(
        matchId,
        newCommandId(),
        {
          source: 'match',
          commandType: 'frame.start',
          command: {},
        },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, error: 'Match is finished', status: 409 })
    expect((await application.streamMatchFacts(matchId)).status).toBe(410)
  })

  test('drives finalizing room cleanup synchronously without opening a stream', async () => {
    const lifecycle: string[] = []
    const application = createApplicationWithDependencies({
      newMatchId: unused,
      newControlSecret: unused,
      now: unused,
      getOrCreateGuestPlayerRef: unused,
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchRecord: async () => ({
        matchId,
        gameKey: 'free-pyramid',
        status: 'finalizing',
        createdAt: v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000),
        participantRefs: { A: playerRefA, B: playerRefB },
      }),
      getProtocolArchive: unused,
      beginMatchCreation: unused,
      activateMatch: unused,
      archiveCompletedMatch: unused,
      finishCompletedMatch: async (id) => {
        lifecycle.push(`finish:${id}`)
      },
      matchRoom: {
        create: unused,
        snapshot: unused,
        command: unused,
        facts: unused,
        stream: unused,
        finalization: unused,
        disposeFinalized: async (id) => {
          lifecycle.push(`dispose:${id}`)
          return { ok: true as const }
        },
      },
    })

    expect((await application.streamMatchFacts(matchId)).status).toBe(410)
    expect(lifecycle).toEqual([`dispose:${matchId}`, `finish:${matchId}`])
  })

  for (const failurePoint of ['archive', 'dispose', 'finish'] as const) {
    test(`terminal archival converges after a failure before ${failurePoint}`, async () => {
      let failurePending = true
      let catalog: 'active' | 'finalizing' | 'finished' = 'active'
      let roomStorageExists = true
      let archiveWrites = 0
      let commandCalls = 0
      const endedAt = v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_999)

      const failOnce = (point: typeof failurePoint) => {
        if (failurePending && point === failurePoint) {
          failurePending = false
          throw new Error(`Injected ${point} failure`)
        }
      }
      const application = createApplicationWithDependencies({
        newMatchId: unused,
        newControlSecret: unused,
        now: unused,
        getOrCreateGuestPlayerRef: unused,
        hydrateParticipant: unused,
        listMatchRecords: unused,
        getMatchRecord: async () => ({
          matchId,
          gameKey: 'free-pyramid',
          status: catalog,
          createdAt: v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000),
          participantRefs: { A: playerRefA, B: playerRefB },
        }),
        getProtocolArchive: unused,
        beginMatchCreation: unused,
        activateMatch: unused,
        archiveCompletedMatch: async () => {
          failOnce('archive')
          if (archiveWrites === 0) archiveWrites += 1
          catalog = 'finalizing'
        },
        finishCompletedMatch: async () => {
          failOnce('finish')
          catalog = 'finished'
        },
        matchRoom: {
          create: unused,
          snapshot: unused,
          command: async () => {
            commandCalls += 1
            return {
              ok: true as const,
              accepted: [{ seq: 9, factId }],
              finalizing: true as const,
            }
          },
          facts: unused,
          stream: unused,
          finalization: async () =>
            roomStorageExists
              ? { ok: true as const, data: { sourceLatestSeq: 9, endedAt, facts: [] } }
              : { ok: false as const, error: 'Unknown match', status: 400 },
          disposeFinalized: async () => {
            failOnce('dispose')
            roomStorageExists = false
            return { ok: true as const }
          },
        },
      })
      const commandId = newCommandId()
      const command: ControlCommand = { source: 'match', commandType: 'match.end', command: {} }

      await expect(application.commandMatch(matchId, commandId, command, 'free-pyramid')).rejects.toThrow(
        `Injected ${failurePoint} failure`,
      )
      await application.commandMatch(matchId, commandId, command, 'free-pyramid')

      expect(archiveWrites).toBe(1)
      expect(roomStorageExists).toBe(false)
      expect(String(catalog)).toBe('finished')
      expect(commandCalls).toBe(failurePoint === 'archive' ? 2 : 1)
    })
  }
})

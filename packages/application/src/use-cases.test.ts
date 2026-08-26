import { describe, expect, test } from 'bun:test'

import type { MatchStateFor } from '@ks/competition'
import {
  type ControlCommand,
  FactIdSchema,
  type MatchId,
  MatchIdSchema,
  MatchStateSchema,
  newCommandId,
  PlayerRefSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import { type ControlProjectionFor, listGameKeys, type RegisteredGameKey } from '@ks/gameplay/definitions'
import { createGameplaySession } from '@ks/gameplay/server'
import * as v from 'valibot'

import type { MatchRoomCreateRequest, MatchRoomReadResult } from './match-room-client'
import { ProtocolArchiveCorruptionError, type ProtocolArchiveRecord, UnsupportedProtocolArchiveVersionError } from './protocol'
import { createApplicationWithDependencies } from './use-cases'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const controlSecret = 'control-secret-1234567890'
const playerRefA = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')
const playerRefB = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB')
const factId = v.parse(FactIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAC')

function stateFor<K extends RegisteredGameKey>(gameKey: K, status: 'active' | 'finished' = 'active'): MatchStateFor<K> {
  return {
    matchId,
    gameKey,
    targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 3 },
    status,
    currentFrameIndex: 1,
    framesWonBySeat: { A: 0, B: 0 },
    frames: [{ frameIndex: 1, pointsBySeat: { A: 0, B: 0 }, breakerSeat: 'A' }],
  }
}

function controlProjectionFor<K extends RegisteredGameKey>(gameKey: K): ControlProjectionFor<K> {
  const args =
    gameKey === 'free-pyramid-long'
      ? { targetPointsBySeat: { A: 30, B: 30 }, rackRollover: 14 as const }
      : {
          targetPointsBySeat: { A: gameKey === 'strila-v2' ? 9 : 8, B: gameKey === 'strila-v2' ? 9 : 8 },
        }
  // SAFETY: the only specialized creation argument is selected by the matching long-pyramid key above.
  return createGameplaySession(gameKey, args as never).deriveControl()
}

const controlProjections = {
  'strila-v2': controlProjectionFor('strila-v2'),
  'free-pyramid': controlProjectionFor('free-pyramid'),
  'free-pyramid-long': controlProjectionFor('free-pyramid-long'),
  'combined-pyramid': controlProjectionFor('combined-pyramid'),
  'combined-pyramid-old': controlProjectionFor('combined-pyramid-old'),
} satisfies { [K in RegisteredGameKey]: ControlProjectionFor<K> }

function activeRoomRead(gameKey: RegisteredGameKey) {
  const controlSections = controlProjections[gameKey].details.commandSections
  switch (gameKey) {
    case 'strila-v2':
      return {
        ok: true as const,
        state: stateFor(gameKey),
        latestSeq: 2,
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
    case 'free-pyramid':
      return {
        ok: true as const,
        state: stateFor(gameKey),
        latestSeq: 2,
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
    case 'free-pyramid-long':
      return {
        ok: true as const,
        state: stateFor(gameKey),
        latestSeq: 2,
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
    case 'combined-pyramid':
      return {
        ok: true as const,
        state: stateFor(gameKey),
        latestSeq: 2,
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
    case 'combined-pyramid-old':
      return {
        ok: true as const,
        state: stateFor(gameKey),
        latestSeq: 2,
        controlProjection: controlProjections[gameKey],
        controlSections,
      }
  }
}

type UnsafeRoomReadMock = {
  ok: true
  state: object
  latestSeq: unknown
  controlProjection: object | undefined
  controlSections: object
}

function unsafeRoomRead(value: UnsafeRoomReadMock): MatchRoomReadResult {
  // SAFETY: Tests use this single boundary to model malformed external RPC data that violates the advertised contract.
  return value as MatchRoomReadResult
}

function applicationForActiveGame(
  catalogGameKey: RegisteredGameKey,
  roomGameKey = catalogGameKey,
  roomRead: MatchRoomReadResult = activeRoomRead(roomGameKey),
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
      readMatch: async <K extends RegisteredGameKey>(_matchId: MatchId, expectedGameKey: K) => {
        if (roomRead.ok && roomRead.state.gameKey !== expectedGameKey) {
          return { ok: false as const, error: 'Invalid MatchRoom response', status: 502 }
        }
        // SAFETY: The key equality check models the private client trust boundary for this use-case fixture.
        return roomRead as MatchRoomReadResult<K>
      },
      submitCommand: unused,
      listFacts: async () => ({ ok: true as const, facts: [] }),
      stream: unused,
      finalization: unused,
      disposeFinalized: unused,
    },
  })
}

function applicationForArchivedGame(
  catalogGameKey: RegisteredGameKey,
  archivedGameKey = catalogGameKey,
  archivedState: MatchStateFor<RegisteredGameKey> = stateFor(archivedGameKey, 'finished'),
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
        sourceLatestSeq: 2,
        protocolVersion: 1,
        rows: [],
        state: archivedState,
      })),
    beginMatchCreation: unused,
    activateMatch: unused,
    archiveCompletedMatch: unused,
    finishCompletedMatch: unused,
    matchRoom: {
      create: unused,
      readMatch: unused,
      submitCommand: unused,
      listFacts: unused,
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
      readMatch: unused,
      submitCommand: unused,
      listFacts: unused,
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
      if (!control.ok || control.controlState !== 'frame-active') throw new Error('Expected active frame')
      expect(control.state.gameKey).toBe(gameKey)
      expect(control.controlProjection.gameKey).toBe(gameKey)

      const protocol = await application.readMatchProtocol(matchId, 'UTC', 'en', gameKey)
      expect(protocol.ok).toBe(true)
      if (!protocol.ok) throw new Error('Expected protocol')
      expect(protocol.state.gameKey).toBe(gameKey)
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

  test('returns invalid RPC when the room state key does not match the expected game key', async () => {
    const application = applicationForActiveGame('free-pyramid', 'combined-pyramid')
    expect(await application.readMatchControl(matchId, 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: 'Invalid MatchRoom response',
      status: 502,
    })
    expect(await application.readMatchProtocol(matchId, 'UTC', 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: 'Invalid MatchRoom response',
      status: 502,
    })
  })

  test('accepts the legitimate active pre-first-frame state without a projection', async () => {
    const valid = activeRoomRead('free-pyramid')
    const preFirstFrame = unsafeRoomRead({
      ...valid,
      state: { ...valid.state, currentFrameIndex: 0, frames: [] },
      controlProjection: undefined,
    })
    const result = await applicationForActiveGame('free-pyramid', 'free-pyramid', preFirstFrame).readMatchControl(
      matchId,
      'en',
      'free-pyramid',
    )
    expect(result.ok && result.controlState).toBe('between-frames')
    const protocol = await applicationForActiveGame('free-pyramid', 'free-pyramid', preFirstFrame).readMatchProtocol(
      matchId,
      'UTC',
      'en',
      'free-pyramid',
    )
    expect(protocol.ok && protocol.controlProjection).toBeUndefined()
  })

  test('hides archived protocol when the archived state key does not match the expected game', async () => {
    const application = applicationForArchivedGame('free-pyramid', 'combined-pyramid')
    expect(await application.readMatchProtocol(matchId, 'UTC', 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: 'Unknown match',
      status: 404,
    })
  })

  test.each([
    ['archive corruption', () => new ProtocolArchiveCorruptionError(matchId), 'Protocol archive corruption'],
    [
      'unsupported archive version',
      () => new UnsupportedProtocolArchiveVersionError(matchId, 2),
      'Unsupported protocol archive version',
    ],
  ])('converts %s into declared failures for completed states and protocol rows', async (_label, error, expectedError) => {
    const controlApplication = applicationForArchivedGame(
      'free-pyramid',
      'free-pyramid',
      stateFor('free-pyramid', 'finished'),
      async () => {
        throw error()
      },
    )
    expect(await controlApplication.readMatchControl(matchId, 'en', 'free-pyramid')).toEqual({
      ok: false,
      error: expectedError,
      status: 500,
    })

    const terminalSnapshot: MatchStateFor<'free-pyramid'> = {
      ...v.parse(MatchStateSchema, {
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
      state: terminalSnapshot,
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
      readMatch: unused,
      submitCommand: unused,
      listFacts: unused,
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
      readMatch: unused,
      async submitCommand(matchId: string, commandId: string, command: ControlCommand) {
        calls.push([matchId, commandId, command])
        return { ok: true as const, outcome: { _tag: 'accepted' as const, accepted: [{ seq: 3, factId }] } }
      },
      listFacts: unused,
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
    expect(await application.submitMatchCommand(matchId, commandId, command, 'combined-pyramid')).toEqual({
      ok: false,
      error: 'Unknown match',
      status: 404,
    })
    expect(calls).toEqual([])
    const result = await application.submitMatchCommand(matchId, commandId, command, 'free-pyramid')

    expect(result).toEqual({
      ok: true,
      outcome: { _tag: 'accepted', accepted: [{ seq: 3, factId }] },
    })
    expect(calls).toEqual([[matchId, commandId, command]])
  })

  test('passes through malformed invalid-command-body without synthesizing an outcome', async () => {
    const command: ControlCommand = { source: 'game', commandType: 'pot.record', command: {} }
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
      matchRoom: {
        create: unused,
        readMatch: unused,
        submitCommand: async () => ({ ok: false, error: 'invalid-command-body', status: 400 }),
        listFacts: unused,
        stream: unused,
        finalization: unused,
        disposeFinalized: unused,
      },
    })

    expect(await application.submitMatchCommand(matchId, newCommandId(), command, 'free-pyramid')).toEqual({
      ok: false,
      error: 'invalid-command-body',
      status: 400,
    })
  })

  test('passes through valid unavailable rejected receipt as declared outcome', async () => {
    const command: ControlCommand = { source: 'match', commandType: 'frame.start', command: {} }
    const rejectedOutcome = { _tag: 'rejected' as const, reason: { code: 'frame-already-active' as const } }
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
      matchRoom: {
        create: unused,
        readMatch: unused,
        submitCommand: async () => ({ ok: true, outcome: rejectedOutcome }),
        listFacts: unused,
        stream: unused,
        finalization: unused,
        disposeFinalized: unused,
      },
    })

    expect(await application.submitMatchCommand(matchId, newCommandId(), command, 'free-pyramid')).toEqual({
      ok: true,
      outcome: rejectedOutcome,
    })
  })

  test('lets a thrown MatchRoom defect reject rather than synthesizing an outcome', async () => {
    const command: ControlCommand = { source: 'match', commandType: 'frame.start', command: {} }
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
      matchRoom: {
        create: unused,
        readMatch: unused,
        submitCommand: async () => {
          throw new Error('post-commit apply failure')
        },
        listFacts: unused,
        stream: unused,
        finalization: unused,
        disposeFinalized: unused,
      },
    })

    await expect(application.submitMatchCommand(matchId, newCommandId(), command, 'free-pyramid')).rejects.toThrow(
      'post-commit apply failure',
    )
  })

  test('reads a finished match entirely from its D1 archive', async () => {
    const archivedState = v.parse(MatchStateSchema, {
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
      readMatch: unused,
      submitCommand: unused,
      listFacts: unused,
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
        state: archivedState,
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
      controlState: 'between-frames',
      state: { ...archivedState, gameKey: 'free-pyramid' },
      latestSeq: 9,
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
    expect(protocol.ok && protocol.state.gameKey).toBe('free-pyramid')
    expect(protocol.ok && protocol.controlProjection).toBeUndefined()
    expect(
      await application.submitMatchCommand(
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
        readMatch: unused,
        submitCommand: unused,
        listFacts: unused,
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
          readMatch: unused,
          submitCommand: async () => {
            commandCalls += 1
            return {
              ok: true as const,
              outcome: { _tag: 'accepted' as const, accepted: [{ seq: 9, factId }] },
              finalizing: true as const,
            }
          },
          listFacts: unused,
          stream: unused,
          finalization: async () =>
            roomStorageExists
              ? {
                  ok: true as const,
                  data: {
                    sourceLatestSeq: 9,
                    endedAt,
                    facts: [],
                    projection: {
                      state: stateFor('free-pyramid', 'finished'),
                      controlProjection: undefined,
                      controlSections: {
                        neutral: [],
                        primary: { A: [], B: [] },
                        secondary: { A: [], B: [] },
                        tertiary: { A: [], B: [] },
                      },
                    },
                  },
                }
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

      await expect(application.submitMatchCommand(matchId, commandId, command, 'free-pyramid')).rejects.toThrow(
        `Injected ${failurePoint} failure`,
      )
      await application.submitMatchCommand(matchId, commandId, command, 'free-pyramid')

      expect(archiveWrites).toBe(1)
      expect(roomStorageExists).toBe(false)
      expect(String(catalog)).toBe('finished')
      expect(commandCalls).toBe(failurePoint === 'archive' ? 2 : 1)
    })
  }
})

import { describe, expect, test } from 'bun:test'

import { MatchSnapshotSchema, UnixEpochMillisecondsSchema, newCommandId, PlayerRefSchema, type ControlCommand } from '@ks/core'
import * as v from 'valibot'

import type { MatchRoomCreateRequest } from './match-room-client'
import { createApplicationWithDependencies } from './use-cases'

const matchId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const controlSecret = 'control-secret-1234567890'
const playerRefA = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')
const playerRefB = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB')

function unused(): never {
  throw new Error('Unexpected dependency call')
}

describe('application orchestration', () => {
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
      playerNames: { A: 'Alice Smith', B: 'Bob Jones' },
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

  test('submits commands to the selected room without a control secret', async () => {
    const command: ControlCommand = { source: 'match', commandType: 'frame.start', command: {} }
    const calls: unknown[][] = []
    const room = {
      create: unused,
      snapshot: unused,
      async command(matchId: string, commandId: string, command: ControlCommand) {
        calls.push([matchId, commandId, command])
        return { ok: true as const, accepted: [{ seq: 3, factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' }] }
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
    const result = await application.commandMatch(`m_${matchId}`, commandId, command)

    expect(result).toEqual({ ok: true, accepted: [{ seq: 3, factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' }] })
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
        rowsJson: '[]',
        snapshotJson: JSON.stringify(snapshot),
      }),
      beginMatchCreation: unused,
      activateMatch: unused,
      archiveCompletedMatch: unused,
      finishCompletedMatch: unused,
      matchRoom: room,
    })

    const result = await application.readMatch(matchId, 'en')

    expect(result).toEqual({
      ok: true,
      snapshot,
      participants: {
        A: { playerRef: playerRefA, displayName: 'Alice Smith', shortDisplayName: 'Alice' },
        B: { playerRef: playerRefB, displayName: 'Bob Jones', shortDisplayName: 'Bob' },
      },
    })
    expect(
      await application.commandMatch(matchId, newCommandId(), {
        source: 'match',
        commandType: 'frame.start',
        command: {},
      }),
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
              accepted: [{ seq: 9, factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' }],
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

      await expect(application.commandMatch(matchId, commandId, command)).rejects.toThrow(`Injected ${failurePoint} failure`)
      await application.commandMatch(matchId, commandId, command)

      expect(archiveWrites).toBe(1)
      expect(roomStorageExists).toBe(false)
      expect(String(catalog)).toBe('finished')
      expect(commandCalls).toBe(failurePoint === 'archive' ? 2 : 1)
    })
  }
})

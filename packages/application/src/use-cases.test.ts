import { describe, expect, test } from 'bun:test'

import { emptyControlSections, MatchId, newCommandId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import type { MatchRoomClient, MatchRoomCompletionTransfer } from './match-room-client'
import { createApplicationWithDependencies } from './use-cases'

const matchId = v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const playerRefA = v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')
const playerRefB = v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB')
const createdAt = v.parse(UnixEpochMilliseconds, 1_700_000_000_000)
const state = {
  matchId,
  gameKey: 'free-pyramid' as const,
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  status: 'active' as const,
  currentFrameIndex: 0,
  framesWonBySeat: { A: 0, B: 0 },
  frames: [],
}
const transfer: MatchRoomCompletionTransfer = {
  matchId,
  gameKey: 'free-pyramid',
  createdAt,
  sourceLatestSeq: 1,
  endedAt: v.parse(UnixEpochMilliseconds, 1_700_000_001_000),
  protocolEntries: [],
  finalState: { ...state, status: 'finished' },
}

function selectedClient(overrides: Partial<MatchRoomClient> = {}): MatchRoomClient {
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected MatchRoom call')
  }
  return {
    initialize: unexpected,
    getControls: unexpected,
    getProtocol: unexpected,
    submitCommand: unexpected,
    stream: unexpected,
    prepareArchive: unexpected,
    dispose: unexpected,
    ...overrides,
  }
}

function application(room: MatchRoomClient, events: string[] = []) {
  let status: 'active' | 'finished' = 'active'
  return createApplicationWithDependencies({
    newMatchId: () => matchId,
    newControlSecret: () => 'control-secret-1234567890',
    now: () => createdAt,
    getOrCreateGuestPlayerRef: async (name) => (name === 'A Player' ? playerRefA : playerRefB),
    hydrateParticipant: async (playerRef) => ({
      playerRef,
      displayName: playerRef,
      shortDisplayName: playerRef,
    }),
    listMatchRecords: async () => [],
    getMatchRecord: async () => ({
      matchId,
      gameKey: 'free-pyramid',
      status,
      createdAt,
      participantRefs: { A: playerRefA, B: playerRefB },
    }),
    getProtocolArchive: async () => ({
      sourceLatestSeq: 1,
      protocolVersion: 1,
      entries: [],
      state: transfer.finalState,
    }),
    beginMatchCreation: async () => {
      events.push('begin')
    },
    activateMatch: async () => {
      events.push('activate')
    },
    archiveCompletedMatch: async () => {
      events.push('archive')
    },
    finishCompletedMatch: async () => {
      events.push('finish')
      status = 'finished'
    },
    matchRoomClient: (selectedMatchId) => {
      expect(selectedMatchId).toBe(matchId)
      return room
    },
  })
}

describe('trusted MatchRoom orchestration', () => {
  test('selects the room once for initialization and activates D1', async () => {
    const events: string[] = []
    const room = selectedClient({
      initialize: async (input) => {
        expect(input.matchId).toBe(matchId)
        events.push('initialize')
        return { _tag: 'initialized', matchId }
      },
    })
    expect(
      await application(room, events).createMatch({
        gameKey: 'free-pyramid',
        targets: state.targets,
        firstBreakerSeat: 'A',
        playerNames: { A: 'A Player', B: 'B Player' },
      }),
    ).toEqual({ ok: true, matchId })
    expect(events).toEqual(['begin', 'initialize', 'activate'])
  })

  test('reads canonical active controls without RPC reparsing', async () => {
    const room = selectedClient({
      getControls: async () => ({
        _tag: 'active',
        latestSeq: 0,
        state,
        controlProjection: undefined,
        controlSections: emptyControlSections(),
      }),
    })
    expect(await application(room).readMatchControl(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      latestSeq: 0,
      state,
    })
  })

  test('archives, disposes, and finishes after a terminal accepted Command', async () => {
    const events: string[] = []
    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'accepted', acceptedSeq: 1, finalizesMatch: true }),
      prepareArchive: async () => {
        events.push('prepare')
        return transfer
      },
      dispose: async () => {
        events.push('dispose')
      },
    })
    const result = await application(room, events).submitMatchCommand(
      matchId,
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
      'free-pyramid',
    )
    expect(result).toEqual({ ok: true, outcome: { _tag: 'accepted', acceptedSeq: 1 } })
    expect(events).toEqual(['prepare', 'archive', 'dispose', 'finish'])
  })

  test('resumes archival when stream admission discovers finalizing', async () => {
    const events: string[] = []
    const room = selectedClient({
      stream: async () => ({ _tag: 'finalizing' }),
      prepareArchive: async () => transfer,
      dispose: async () => {
        events.push('dispose')
      },
    })
    const response = await application(room, events).streamMatchUpdates(matchId)
    expect(response.status).toBe(410)
    expect(events).toEqual(['archive', 'dispose', 'finish'])
  })

  test('resumes archival when a control read discovers finalizing', async () => {
    const events: string[] = []
    const room = selectedClient({
      getControls: async () => ({ _tag: 'finalizing' }),
      prepareArchive: async () => transfer,
      dispose: async () => {
        events.push('dispose')
      },
    })
    expect(await application(room, events).readMatchControl(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      state: { status: 'finished' },
    })
    expect(events).toEqual(['archive', 'dispose', 'finish'])
  })

  test('resumes archival when a Protocol read discovers finalizing', async () => {
    const events: string[] = []
    const room = selectedClient({
      getProtocol: async () => ({ _tag: 'finalizing' }),
      prepareArchive: async () => transfer,
      dispose: async () => {
        events.push('dispose')
      },
    })
    expect(
      await application(room, events).readMatchProtocol(matchId, 'UTC', 'en', 'free-pyramid'),
    ).toMatchObject({
      ok: true,
      state: { status: 'finished' },
    })
    expect(events).toEqual(['archive', 'dispose', 'finish'])
  })

  test('resumes archival when Command submission discovers finalizing', async () => {
    const events: string[] = []
    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'finalizing' }),
      prepareArchive: async () => transfer,
      dispose: async () => {
        events.push('dispose')
      },
    })
    expect(
      await application(room, events).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, error: 'match-locked', status: 409 })
    expect(events).toEqual(['archive', 'dispose', 'finish'])
  })

  test('does not synthesize transport failures for thrown MatchRoom defects', async () => {
    const defect = new Error('room defect')
    const room = selectedClient({ submitCommand: async () => await Promise.reject(defect) })
    await expect(
      application(room).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
        'free-pyramid',
      ),
    ).rejects.toBe(defect)
  })
})

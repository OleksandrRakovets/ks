import { describe, expect, test } from 'bun:test'

import { MatchId, newCommandId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
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
    prepareArchive: unexpected,
    finalize: unexpected,
    ...overrides,
  }
}

type Dependencies = Parameters<typeof createApplicationWithDependencies>[0]

function application(
  room: MatchRoomClient,
  events: string[] = [],
  options: {
    initialStatus?: 'active' | 'finished'
    overrides?: Partial<Dependencies>
  } = {},
) {
  let status = options.initialStatus ?? ('active' as const)
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
      entries: [
        {
          acceptedSeq: 1,
          entryIndex: 0,
          causedByCommandId: newCommandId(),
          acceptedAt: createdAt,
          frameIndex: 1,
          gameKey: 'free-pyramid',
          source: 'system',
          entryType: 'frame-prepared',
          seat: 'A',
          body: {},
        },
      ],
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
    markMatchFinished: async () => {
      events.push('finish')
      status = 'finished'
    },
    matchRoomClient: (selectedMatchId) => {
      expect(selectedMatchId).toBe(matchId)
      return room
    },
    ...options.overrides,
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
        game: undefined,
        controls: [],
      }),
    })
    expect(await application(room).readMatchControl(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      latestSeq: 0,
      state,
    })
  })

  test('archives, finalizes, and finishes after a match-completing Accepted Command', async () => {
    const events: string[] = []
    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'accepted', acceptedSeq: 1, completesMatch: true }),
      prepareArchive: async () => {
        events.push('prepare')
        return transfer
      },
      finalize: async () => {
        events.push('finalize')
      },
    })
    const result = await application(room, events).submitMatchCommand(
      matchId,
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
      'free-pyramid',
    )
    expect(result).toEqual({ ok: true, outcome: { _tag: 'accepted', acceptedSeq: 1 } })
    expect(events).toEqual(['prepare', 'archive', 'finalize', 'finish'])
  })

  test('admits only active Matches to their live transport', async () => {
    expect(await application(selectedClient()).admitSparringMatchLive(matchId)).toEqual({
      _tag: 'admitted',
    })
    expect(
      await application(selectedClient(), [], { initialStatus: 'finished' }).admitSparringMatchLive(matchId),
    ).toEqual({ _tag: 'finished' })
  })

  test('resumes archival when a control read discovers finalizing', async () => {
    const events: string[] = []
    const room = selectedClient({
      getControls: async () => ({ _tag: 'finalizing' }),
      prepareArchive: async () => transfer,
      finalize: async () => {
        events.push('finalize')
      },
    })
    expect(await application(room, events).readMatchControl(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      controlState: 'finished',
      state: { status: 'finished' },
      controls: [],
    })
    expect(events).toEqual(['archive', 'finalize', 'finish'])
  })

  test('resumes archival when a Protocol read discovers finalizing', async () => {
    const events: string[] = []
    const room = selectedClient({
      getProtocol: async () => ({ _tag: 'finalizing' }),
      prepareArchive: async () => transfer,
      finalize: async () => {
        events.push('finalize')
      },
    })
    expect(
      await application(room, events).readMatchProtocol(matchId, 'UTC', 'en', 'free-pyramid'),
    ).toMatchObject({
      ok: true,
      state: { status: 'finished' },
    })
    expect(events).toEqual(['archive', 'finalize', 'finish'])
  })

  test('resumes archival when Command submission discovers finalizing', async () => {
    const events: string[] = []
    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'finalizing' }),
      prepareArchive: async () => transfer,
      finalize: async () => {
        events.push('finalize')
      },
    })
    expect(
      await application(room, events).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, error: 'match-locked', status: 409 })
    expect(events).toEqual(['archive', 'finalize', 'finish'])
  })

  test('returns malformed nested Commands as invalid request data', async () => {
    const room = selectedClient({ submitCommand: async () => ({ _tag: 'invalid-command' }) })
    expect(
      await application(room).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'unsupported' } },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, error: 'invalid-command-body', status: 400 })
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

  test('does not finalize when archival fails before or after persistence and converges on retry', async () => {
    const events: string[] = []
    let archiveAttempts = 0
    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'accepted', acceptedSeq: 1, completesMatch: true }),
      prepareArchive: async () => transfer,
      finalize: async () => {
        events.push('finalize')
      },
    })
    const app = application(room, events, {
      overrides: {
        archiveCompletedMatch: async () => {
          archiveAttempts += 1
          events.push(archiveAttempts === 1 ? 'archive-persisted-response-lost' : 'archive-retry')
          if (archiveAttempts === 1) throw new Error('lost archive response')
        },
      },
    })
    const command = { commandId: newCommandId(), source: 'match' as const, command: { type: 'frame.prepare' } }
    await expect(app.submitMatchCommand(matchId, command, 'free-pyramid')).rejects.toThrow(
      'lost archive response',
    )
    expect(events).toEqual(['archive-persisted-response-lost'])
    await expect(app.submitMatchCommand(matchId, command, 'free-pyramid')).resolves.toMatchObject({ ok: true })
    expect(events).toEqual(['archive-persisted-response-lost', 'archive-retry', 'finalize', 'finish'])
  })
})

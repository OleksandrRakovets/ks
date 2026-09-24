import { describe, expect, test } from 'bun:test'

import {
  FixedClock,
  MatchId,
  newCommandId,
  PlayerRef,
  projectMatchScore,
  UnixEpochMilliseconds,
} from '@ks/core'
import * as v from 'valibot'

import { MatchScorePollResponse, RECENT_FINISHED_MATCH_WINDOW_MS } from '../contracts/sparring'
import type { MatchRoomArchiveTransfer, MatchRoomClient } from '../match-room-client'
import { createSparringApplicationWithDependencies } from './sparring'

const matchId = v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAV')

const playerRefA = v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')

const playerRefB = v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB')

const participants = {
  A: { playerRef: playerRefA, displayName: 'Alice Alpha', shortDisplayName: 'A. Alpha' },
  B: { playerRef: playerRefB, displayName: 'Bob Beta', shortDisplayName: 'B. Beta' },
}

const createdAt = v.parse(UnixEpochMilliseconds, 1_700_000_000_000)

const clock = new FixedClock(new Date(createdAt), 'Europe/Kyiv')

const state = {
  matchId,
  gameKey: 'free-pyramid' as const,
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  status: 'active' as const,
  currentFrameIndex: 0,
  framesWonBySeat: { A: 0, B: 0 },
  frames: [],
}

const transfer: MatchRoomArchiveTransfer = {
  matchId,
  gameKey: 'free-pyramid',
  createdAt,
  sourceLatestSeq: 1,
  endedAt: v.parse(UnixEpochMilliseconds, 1_700_000_001_000),
  protocolEntries: [],
  finalState: { ...state, status: 'finished' },
  gameResult: null,
}

function selectedClient(overrides: Partial<MatchRoomClient> = {}): MatchRoomClient {
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected MatchRoom call')
  }

  return {
    initialize: unexpected,
    getControls: unexpected,
    getProtocol: unexpected,
    getScore: unexpected,
    submitCommand: unexpected,
    prepareArchive: unexpected,
    finalize: unexpected,
    ...overrides,
  }
}

type Dependencies = Parameters<typeof createSparringApplicationWithDependencies>[0]

function sparring(
  room: MatchRoomClient,
  events: string[] = [],
  options: {
    initialStatus?: 'active' | 'finished'
    overrides?: Partial<Dependencies>
  } = {},
) {
  let status = options.initialStatus ?? ('active' as const)

  const matchRecord = () => {
    const identity = {
      matchId,
      gameKey: 'free-pyramid' as const,
      createdAt,
      participantRefs: { A: playerRefA, B: playerRefB },
    }

    return status === 'finished'
      ? {
          ...identity,
          status,
          endedAt: transfer.endedAt,
          finalSourceLatestSeq: transfer.sourceLatestSeq,
          finalScore: projectMatchScore(transfer.finalState),
        }
      : { ...identity, status }
  }

  return createSparringApplicationWithDependencies({
    clock,
    newMatchId: () => matchId,
    newControlSecret: () => 'control-secret-1234567890',
    getOrCreateGuestPlayerRef: async (name) => (name === 'A Player' ? playerRefA : playerRefB),
    hydrateParticipant: async (playerRef) => ({
      playerRef,
      displayName: playerRef,
      shortDisplayName: playerRef,
    }),
    listLiveMatchRecords: async () => [],
    listFinishedMatchRecords: async () => [],
    findFinishedMatchTime: async () => null,
    getMatchRecord: async () => matchRecord(),
    getMatchRecords: async () => [matchRecord()],
    getFinishedMatchArchive: async () => ({
      sourceLatestSeq: 1,
      state: transfer.finalState,
      gameResult: null,
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
      gameResult: null,
    }),
    beginMatchCreation: async () => {
      events.push('begin')
    },
    activateMatch: async () => {
      events.push('activate')
    },
    archiveFinishedMatch: async () => {
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
      await sparring(room, events).createMatch({
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
      getProtocol: async () => ({
        _tag: 'active',
        latestSeq: 0,
        state,
        protocolEntries: [],
      }),
    })

    expect(await sparring(room).readMatch(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      lifecycle: 'active',
      controlPhase: 'between-frames',
      latestSeq: 0,
      state,
    })
  })

  test('reads compact active scores for list loading and polling', async () => {
    const score = {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 0, B: 0 },
      singleFramePointsBySeat: null,
      activeFrame: null,
    }

    const room = selectedClient({ getScore: async () => ({ _tag: 'active', latestSeq: 3, score }) })

    const app = sparring(room, [], {
      overrides: {
        listLiveMatchRecords: async (since, locale) => {
          expect(since).toBe(v.parse(UnixEpochMilliseconds, createdAt - RECENT_FINISHED_MATCH_WINDOW_MS))
          expect(locale).toBe('en')

          return [
            {
              matchId,
              gameKey: 'free-pyramid',
              status: 'active',
              createdAt,
              participantRefs: { A: playerRefA, B: playerRefB },
              participants,
            },
          ]
        },
      },
    })

    expect(await app.listLiveMatches('en')).toMatchObject({
      matches: [
        {
          matchId,
          status: 'active',
          createdAtIso: '2023-11-14T22:13:20.000Z',
          createdAtLabel: '00:13',
          createdAtDate: { year: '2023', month: '11', day: '15' },
          createdAtIsToday: true,
          endedAt: null,
          latestSeq: 3,
          score,
          participants,
          hasCustomFrameTarget: false,
        },
      ],
      scope: 'live',
    })
    expect(await app.readMatchScores([matchId])).toEqual({
      ok: true,
      matches: [{ matchId, status: 'active', endedAt: null, latestSeq: 3, score }],
    })
  })

  test('marks a changed target on either seat in list and finished match reads', async () => {
    for (const frameTargetPointsBySeat of [
      { A: 10, B: 8 },
      { A: 8, B: 6 },
    ]) {
      const customState = { ...state, targets: { frameTargetPointsBySeat, matchTargetFrames: 1 } }
      const score = projectMatchScore(customState)

      const room = selectedClient({
        getScore: async () => ({ _tag: 'active', latestSeq: 0, score }),
        getControls: async () => ({
          _tag: 'finalizing',
          state: { ...customState, status: 'finished' },
          gameResult: null,
          latestSeq: 1,
          endedAt: transfer.endedAt,
        }),
      })

      const app = sparring(room, [], {
        overrides: {
          listLiveMatchRecords: async () => [
            {
              matchId,
              gameKey: 'free-pyramid',
              status: 'active',
              createdAt,
              participantRefs: { A: playerRefA, B: playerRefB },
              participants,
            },
          ],
        },
      })

      expect((await app.listLiveMatches('en')).matches[0]?.hasCustomFrameTarget).toBe(true)
      expect(await app.readMatch(matchId, 'en', 'free-pyramid')).toMatchObject({
        ok: true,
        lifecycle: 'finished',
        hasCustomFrameTarget: true,
      })
    }
  })

  test('reads finalizing scores for the live list and polling without archiving', async () => {
    const events: string[] = []

    const score = {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 1, B: 0 },
      singleFramePointsBySeat: { A: 8, B: 3 },
      activeFrame: null,
    }

    const room = selectedClient({
      getScore: async () => ({
        _tag: 'finalizing',
        endedAt: transfer.endedAt,
        latestSeq: 4,
        score,
      }),
    })

    const app = sparring(room, events, {
      overrides: {
        listLiveMatchRecords: async () => [
          {
            matchId,
            gameKey: 'free-pyramid',
            status: 'active',
            createdAt,
            participantRefs: { A: playerRefA, B: playerRefB },
            participants,
          },
        ],
      },
    })

    expect(await app.listLiveMatches('en')).toMatchObject({
      matches: [{ matchId, status: 'finished', endedAt: transfer.endedAt, latestSeq: 4, score }],
    })
    expect(await app.readMatchScores([matchId])).toEqual({
      ok: true,
      matches: [{ matchId, status: 'finished', endedAt: transfer.endedAt, latestSeq: 4, score }],
    })
    expect(events).toEqual([])
  })

  test('reports when a recently finished match leaves the live list window', async () => {
    const finalScore = projectMatchScore(transfer.finalState)
    const endedAt = v.parse(UnixEpochMilliseconds, createdAt - 5 * 60 * 1_000)

    const app = sparring(selectedClient(), [], {
      overrides: {
        listLiveMatchRecords: async () => [
          {
            matchId,
            gameKey: 'free-pyramid',
            status: 'finished',
            createdAt,
            endedAt,
            participantRefs: { A: playerRefA, B: playerRefB },
            participants,
            finalSourceLatestSeq: transfer.sourceLatestSeq,
            finalScore,
          },
        ],
      },
    })

    expect(await app.listLiveMatches('en')).toMatchObject({
      recentFinishedMatchExpiresAfterMs: 10 * 60 * 1_000,
    })
  })

  test('loads the finished list from stored projections without selecting MatchRoom', async () => {
    const finalScore = projectMatchScore(transfer.finalState)

    const nextDayClock = new FixedClock(new Date('2023-11-15T22:30:00.000Z'), 'Europe/Kyiv')

    const app = sparring(selectedClient(), [], {
      overrides: {
        clock: nextDayClock,
        hydrateParticipant: async () => {
          throw new Error('List entries must use participants returned by the list read')
        },
        findFinishedMatchTime: async (query) => {
          if ('before' in query && query.before === Number.MAX_SAFE_INTEGER) return createdAt

          return null
        },
        listFinishedMatchRecords: async (range, locale) => {
          expect(range).toEqual({
            start: v.parse(UnixEpochMilliseconds, Date.parse('2023-11-14T22:00:00Z')),
            end: v.parse(UnixEpochMilliseconds, Date.parse('2023-11-15T22:00:00Z')),
          })
          expect(locale).toBe('en')

          return [
            {
              matchId,
              gameKey: 'free-pyramid',
              status: 'finished',
              createdAt,
              endedAt: transfer.endedAt,
              participantRefs: { A: playerRefA, B: playerRefB },
              participants,
              finalSourceLatestSeq: transfer.sourceLatestSeq,
              finalScore,
            },
          ]
        },
      },
    })

    expect(await app.listFinishedMatches('en')).toMatchObject({
      matches: [
        {
          matchId,
          status: 'finished',
          createdAtIso: '2023-11-14T22:13:20.000Z',
          createdAtLabel: '00:13',
          createdAtDate: { year: '2023', month: '11', day: '15' },
          createdAtIsToday: false,
          endedAt: transfer.endedAt,
          latestSeq: transfer.sourceLatestSeq,
          score: finalScore,
          participants,
          hasCustomFrameTarget: false,
        },
      ],
      scope: 'finished',
      day: '2023-11-15',
      previousDay: null,
      nextDay: null,
      isToday: false,
    })
  })

  test('skips calendar gaps using only the two indexed neighboring instants', async () => {
    const selected = '2023-11-20'
    const before = v.parse(UnixEpochMilliseconds, Date.parse('2023-11-19T22:00:00Z'))
    const from = v.parse(UnixEpochMilliseconds, Date.parse('2023-11-20T22:00:00Z'))
    const newer = v.parse(UnixEpochMilliseconds, Date.parse('2023-11-25T23:00:00Z'))
    const seeks: unknown[] = []

    const app = sparring(selectedClient(), [], {
      overrides: {
        listFinishedMatchRecords: async (range) => {
          expect(range).toEqual({ start: before, end: from })

          return []
        },
        findFinishedMatchTime: async (query) => {
          seeks.push(query)

          return 'before' in query ? createdAt : newer
        },
      },
    })

    expect(await app.listFinishedMatches('en', selected)).toEqual({
      scope: 'finished',
      matches: [],
      day: selected,
      previousDay: '2023-11-15',
      nextDay: '2023-11-26',
      isToday: false,
    })
    expect(seeks).toEqual([{ before }, { from }])
  })

  test('polls more than ten finished score projections without truncating or reordering them', async () => {
    const ids = Array.from({ length: 12 }, (_, index) =>
      v.parse(MatchId, `${matchId.slice(0, 24)}${String(index).padStart(2, '0')}`),
    )

    const finalScore = projectMatchScore(transfer.finalState)

    const app = sparring(selectedClient(), [], {
      overrides: {
        getMatchRecords: async (requested) =>
          requested.map((id) => ({
            matchId: id,
            gameKey: 'free-pyramid',
            status: 'finished' as const,
            createdAt,
            endedAt: transfer.endedAt,
            participantRefs: { A: playerRefA, B: playerRefB },
            finalSourceLatestSeq: transfer.sourceLatestSeq,
            finalScore,
          })),
      },
    })

    const result = await app.readMatchScores(ids)
    expect(result.ok).toBe(true)

    if (!result.ok) return
    expect(result.matches.map((match) => match.matchId)).toEqual(ids)
    expect(v.safeParse(MatchScorePollResponse, { matches: result.matches }).success).toBe(true)
  })

  test('reads Protocol and Control projections at the Control cursor', async () => {
    const commandId = newCommandId()

    const room = selectedClient({
      getControls: async () => ({
        _tag: 'active',
        latestSeq: 1,
        state,
        game: undefined,
        controls: [],
      }),
      getProtocol: async () => ({
        _tag: 'active',
        latestSeq: 2,
        state: { ...state, currentFrameIndex: 1 },
        protocolEntries: [
          {
            acceptedSeq: 1,
            entryIndex: 0,
            causedByCommandId: commandId,
            acceptedAt: createdAt,
            frameIndex: 1,
            gameKey: 'free-pyramid',
            source: 'player',
            entryType: 'command',
            seat: 'A',
            body: { commandType: 'miss.record' },
          },
          {
            acceptedSeq: 2,
            entryIndex: 0,
            causedByCommandId: newCommandId(),
            acceptedAt: createdAt,
            frameIndex: 1,
            gameKey: 'free-pyramid',
            source: 'player',
            entryType: 'command',
            seat: 'B',
            body: { commandType: 'miss.record' },
          },
        ],
      }),
    })

    const result = await sparring(room).readMatchProtocol(matchId, 'en', 'free-pyramid')

    expect(result).toMatchObject({
      ok: true,
      latestSeq: 1,
      state,
      protocolRows: [{ key: 'protocol-1-0' }],
    })
  })

  test('archives, finalizes, and finishes after a match-ending Accepted Command', async () => {
    const events: string[] = []

    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'accepted', acceptedSeq: 1, endsMatch: true }),
      prepareArchive: async () => {
        events.push('prepare')

        return transfer
      },
      finalize: async () => {
        events.push('finalize')
      },
    })

    const result = await sparring(room, events).submitMatchCommand(
      matchId,
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
      'free-pyramid',
    )

    expect(result).toEqual({ ok: true, outcome: { _tag: 'accepted', acceptedSeq: 1 } })
    expect(events).toEqual(['prepare', 'archive', 'finalize', 'finish'])
  })

  test('admits only active Matches to their live transport', async () => {
    expect(await sparring(selectedClient()).admitMatchLive(matchId)).toEqual({
      _tag: 'admitted',
    })
    expect(
      await sparring(selectedClient(), [], { initialStatus: 'finished' }).admitMatchLive(matchId),
    ).toEqual({ _tag: 'finished' })
  })

  test('reads finalizing controls from MatchRoom without archiving', async () => {
    const events: string[] = []
    const nextDayClock = new FixedClock(new Date('2023-11-15T22:30:00.000Z'), 'Europe/Kyiv')

    const room = selectedClient({
      getControls: async () => ({
        _tag: 'finalizing',
        state: transfer.finalState,
        gameResult: null,
        latestSeq: 2,
        endedAt: transfer.endedAt,
      }),
    })

    const result = await sparring(room, events, { overrides: { clock: nextDayClock } }).readMatch(
      matchId,
      'en',
      'free-pyramid',
    )

    expect(result).toMatchObject({
      ok: true,
      lifecycle: 'finished',
      state: { status: 'finished' },
      latestSeq: 2,
      endedAtIso: '2023-11-14T22:13:21.000Z',
      endedAtTime: '00:13',
      endedAtDate: { year: '2023', month: '11', day: '15' },
      endedAtIsToday: false,
    })
    expect(result).not.toHaveProperty('endedAt')
    expect(events).toEqual([])
  })

  test('reads the final result without Protocol replay when the Match ends between room calls', async () => {
    const room = selectedClient({
      getControls: async () => ({
        _tag: 'active',
        latestSeq: 0,
        state,
        game: undefined,
        controls: [],
      }),
      getProtocol: async () => ({
        _tag: 'finalizing',
        state: transfer.finalState,
        gameResult: null,
        latestSeq: 2,
        endedAt: transfer.endedAt,
      }),
    })

    expect(await sparring(room).readMatch(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      lifecycle: 'finished',
      latestSeq: 2,
      state: { status: 'finished' },
    })
  })

  test('reads finalizing Protocol when the Match ends between room calls without archiving', async () => {
    const events: string[] = []

    const room = selectedClient({
      getControls: async () => ({
        _tag: 'active',
        latestSeq: 0,
        state,
        game: undefined,
        controls: [],
      }),
      getProtocol: async () => ({
        _tag: 'finalizing',
        state: transfer.finalState,
        gameResult: null,
        latestSeq: 2,
        endedAt: transfer.endedAt,
      }),
      prepareArchive: async () => ({
        ...transfer,
        sourceLatestSeq: 2,
        protocolEntries: [
          {
            acceptedSeq: 2,
            entryIndex: 0,
            causedByCommandId: newCommandId(),
            acceptedAt: transfer.endedAt,
            frameIndex: 1,
            gameKey: 'free-pyramid',
            source: 'system',
            entryType: 'match-ended',
            seat: 'A',
            body: {},
          },
        ],
      }),
    })

    expect(await sparring(room, events).readMatchProtocol(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      state: { status: 'finished' },
      latestSeq: 2,
      protocolRows: [{ key: 'protocol-2-0', message: { key: 'match.protocol.system.match-ended' } }],
    })
    expect(events).toEqual([])
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
      await sparring(room, events).submitMatchCommand(
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
      await sparring(room).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'unsupported' } },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, error: 'invalid-command-body', status: 400 })
  })

  test('does not synthesize transport failures for thrown MatchRoom defects', async () => {
    const defect = new Error('room defect')
    const room = selectedClient({ submitCommand: () => Promise.reject(defect) })
    let error: Error | undefined

    try {
      await sparring(room).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
        'free-pyramid',
      )
    } catch (reason) {
      if (!(reason instanceof Error)) throw reason
      error = reason
    }

    expect(error).toBe(defect)
  })

  test('does not finalize when archival fails before or after persistence and converges on retry', async () => {
    const events: string[] = []
    let archiveAttempts = 0

    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'accepted', acceptedSeq: 1, endsMatch: true }),
      prepareArchive: async () => transfer,
      finalize: async () => {
        events.push('finalize')
      },
    })

    const app = sparring(room, events, {
      overrides: {
        archiveFinishedMatch: async () => {
          archiveAttempts += 1
          events.push(archiveAttempts === 1 ? 'archive-persisted-response-lost' : 'archive-retry')

          if (archiveAttempts === 1) throw new Error('lost archive response')
        },
      },
    })

    const command = { commandId: newCommandId(), source: 'match' as const, command: { type: 'frame.prepare' } }
    let archiveError: Error | undefined

    try {
      await app.submitMatchCommand(matchId, command, 'free-pyramid')
    } catch (reason) {
      if (!(reason instanceof Error)) throw reason
      archiveError = reason
    }

    expect(archiveError?.message).toBe('lost archive response')
    expect(events).toEqual(['archive-persisted-response-lost'])
    expect(await app.submitMatchCommand(matchId, command, 'free-pyramid')).toMatchObject({ ok: true })
    expect(events).toEqual(['archive-persisted-response-lost', 'archive-retry', 'finalize', 'finish'])
  })
})

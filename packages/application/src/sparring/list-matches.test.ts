import { describe, expect, test } from 'bun:test'

import { projectMatchScore } from '@ks/competition'
import { FixedClock, MatchId, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import { MatchScorePollResponse } from './contract'
import {
  createdAt,
  matchId,
  participantRecords,
  participants,
  playerRefA,
  playerRefB,
  selectedClient,
  sparring,
  state,
  transfer,
} from './sparring.fixtures'

describe('sparring lists and score polling', () => {
  test('returns unknown-match when any requested score is missing or discarded, before reading rooms', async () => {
    const missingId = v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAW')

    expect(await sparring(selectedClient()).readMatchScores([matchId, missingId])).toEqual({
      ok: false,
      reason: 'unknown-match',
    })
    expect(
      await sparring(selectedClient(), [], { initialStatus: 'discarded' }).readMatchScores([matchId]),
    ).toEqual({ ok: false, reason: 'unknown-match' })
  })

  test('reads compact active scores for list loading and polling', async () => {
    const score = {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 0, B: 0 },
      winnerSeat: null,
      singleFramePointsBySeat: null,
      activeFrame: null,
    }

    const room = selectedClient({ getScore: async () => ({ _tag: 'active', latestSeq: 3, score }) })

    const app = sparring(room, [], {
      matches: {
        listLive: async (since) => {
          expect(since).toBe(v.parse(UnixEpochMilliseconds, createdAt - 15 * 60 * 1_000))

          return [
            {
              matchId,
              gameKey: 'free-pyramid',
              status: 'active',
              createdAt,
              participantRefs: { A: playerRefA, B: playerRefB },
              participants: participantRecords,
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

  test('marks a changed target on either seat in list metadata', async () => {
    for (const frameTargetPointsBySeat of [
      { A: 10, B: 8 },
      { A: 8, B: 6 },
    ]) {
      const customState = { ...state, targets: { frameTargetPointsBySeat, matchTargetFrames: 1 } }
      const score = projectMatchScore(customState)

      const room = selectedClient({
        getScore: async () => ({ _tag: 'active', latestSeq: 0, score }),
      })

      const app = sparring(room, [], {
        matches: {
          listLive: async () => [
            {
              matchId,
              gameKey: 'free-pyramid',
              status: 'active',
              createdAt,
              participantRefs: { A: playerRefA, B: playerRefB },
              participants: participantRecords,
            },
          ],
        },
      })

      expect((await app.listLiveMatches('en')).matches[0]?.hasCustomFrameTarget).toBe(true)
    }
  })

  test('reads finalizing scores for the live list and polling without archiving', async () => {
    const events: string[] = []

    const score = {
      matchTargetFrames: 1,
      frameTargetPointsBySeat: { A: 8, B: 8 },
      framesWonBySeat: { A: 1, B: 0 },
      winnerSeat: 'B' as const,
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
      matches: {
        listLive: async () => [
          {
            matchId,
            gameKey: 'free-pyramid',
            status: 'active',
            createdAt,
            participantRefs: { A: playerRefA, B: playerRefB },
            participants: participantRecords,
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

  test('transports the stored winner to Result, Protocol, finished list, and polling without MatchRoom reads', async () => {
    const finalState = {
      ...transfer.finalState,
      winnerSeat: 'B' as const,
      framesWonBySeat: { A: 2, B: 0 },
    }

    const finalScore = projectMatchScore(finalState)

    const record = {
      matchId,
      gameKey: 'free-pyramid' as const,
      status: 'finished' as const,
      createdAt,
      endedAt: transfer.endedAt,
      participantRefs: { A: playerRefA, B: playerRefB },
      participants: participantRecords,
      finalSourceLatestSeq: transfer.sourceLatestSeq,
      finalScore,
    }

    const app = sparring(selectedClient(), [], {
      initialStatus: 'finished',
      matches: {
        findMatch: async () => record,
        listMatches: async () => [record],
        findFinishedArchive: async () => ({ sourceLatestSeq: 1, state: finalState, gameResult: null }),
        findProtocolArchive: async () => ({
          sourceLatestSeq: 1,
          state: finalState,
          gameResult: null,
          entries: [],
          protocolVersion: 1,
        }),
        listFinished: async () => [record],
      },
    })

    expect(await app.readMatch(matchId, 'en', 'free-pyramid')).toMatchObject({ winnerSeat: 'B' })
    expect(await app.readMatchProtocol(matchId, 'en', 'free-pyramid')).toMatchObject({
      winnerSeat: 'B',
    })
    expect(await app.listFinishedMatches('en', '2023-11-15')).toMatchObject({
      matches: [{ score: { winnerSeat: 'B' } }],
    })
    const poll = await app.readMatchScores([matchId])
    expect(poll).toMatchObject({ matches: [{ score: { winnerSeat: 'B' } }] })
    expect(v.safeParse(MatchScorePollResponse, poll).success).toBe(true)
  })

  test('loads the finished list from stored projections without selecting MatchRoom', async () => {
    const finalScore = projectMatchScore(transfer.finalState)

    const nextDayClock = new FixedClock(new Date('2023-11-15T22:30:00.000Z'), 'Europe/Kyiv')

    const app = sparring(selectedClient(), [], {
      overrides: { clock: nextDayClock },
      players: {
        readParticipant: async () => {
          throw new Error('List entries must use participants returned by the list read')
        },
      },
      matches: {
        findFinishedTime: async (query) => {
          if ('before' in query && query.before === Number.MAX_SAFE_INTEGER) return createdAt

          return null
        },
        listFinished: async (range) => {
          expect(range).toEqual({
            start: v.parse(UnixEpochMilliseconds, Date.parse('2023-11-14T22:00:00Z')),
            end: v.parse(UnixEpochMilliseconds, Date.parse('2023-11-15T22:00:00Z')),
          })

          return [
            {
              matchId,
              gameKey: 'free-pyramid',
              status: 'finished',
              createdAt,
              endedAt: transfer.endedAt,
              participantRefs: { A: playerRefA, B: playerRefB },
              participants: participantRecords,
              finalSourceLatestSeq: transfer.sourceLatestSeq,
              finalScore,
            },
          ]
        },
      },
    })

    expect(await app.latestFinishedMatchDay()).toBe('2023-11-15')
    expect(await app.listFinishedMatches('en', '2023-11-15')).toMatchObject({
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

  test('defaults the finished day to today before any Match has finished', async () => {
    const app = sparring(selectedClient(), [], {
      overrides: { clock: new FixedClock(new Date('2023-11-15T22:30:00.000Z'), 'Europe/Kyiv') },
      matches: { findFinishedTime: async () => null },
    })

    expect(await app.latestFinishedMatchDay()).toBe('2023-11-16')
  })

  test('skips calendar gaps using only the two indexed neighboring instants', async () => {
    const selected = '2023-11-20'
    const before = v.parse(UnixEpochMilliseconds, Date.parse('2023-11-19T22:00:00Z'))
    const from = v.parse(UnixEpochMilliseconds, Date.parse('2023-11-20T22:00:00Z'))
    const newer = v.parse(UnixEpochMilliseconds, Date.parse('2023-11-25T23:00:00Z'))
    const seeks: unknown[] = []

    const app = sparring(selectedClient(), [], {
      matches: {
        listFinished: async (range) => {
          expect(range).toEqual({ start: before, end: from })

          return []
        },
        findFinishedTime: async (query) => {
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
      matches: {
        listMatches: async (requested) =>
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
})

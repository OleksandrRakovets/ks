import { describe, expect, test } from 'bun:test'

import {
  emptyControlCommandSections,
  FactIdSchema,
  MatchIdSchema,
  newCommandId,
  PlayerRefSchema,
  StoredMatchFactSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import { createGameplaySession } from '@ks/gameplay/server'
import * as v from 'valibot'

import { createMatchRoomClient, type MatchRoomCreateRequest } from './match-room-client'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const otherMatchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAW')
const invalid = { ok: false, error: 'Invalid MatchRoom response', status: 502 } as const
const state = {
  matchId,
  gameKey: 'free-pyramid' as const,
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  status: 'active' as const,
  currentFrameIndex: 1,
  framesWonBySeat: { A: 0, B: 0 },
  frames: [{ frameIndex: 1, pointsBySeat: { A: 0, B: 0 }, breakerSeat: 'A' as const }],
}
const controlProjection = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 } }).deriveControl()
const roomRead = { ok: true as const, state, latestSeq: 2, controlProjection, controlSections: emptyControlCommandSections() }
const creationFact = v.parse(StoredMatchFactSchema, {
  factId: v.parse(FactIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAC'),
  matchId,
  causedByCommandId: null,
  acceptedAt: 1_700_000_000_000,
  seq: 1,
  type: 'match.created',
  payload: {
    matchId,
    gameKey: 'free-pyramid',
    targets: state.targets,
    firstBreakerSeat: 'A',
  },
})
type TestRpcResult = {
  readonly ok?: unknown
  readonly matchId?: unknown
  readonly state?: unknown
  readonly latestSeq?: unknown
  readonly controlProjection?: unknown
  readonly controlSections?: unknown
  readonly outcome?: unknown
  readonly facts?: unknown
  readonly data?: unknown
  readonly error?: unknown
  readonly status?: unknown
}

function clientReturning(result: TestRpcResult) {
  const response = new Response()
  const stub = {
    create: async () => result,
    readMatch: async () => result,
    submitCommand: async () => result,
    stream: async () => response,
    listFacts: async () => result,
    finalization: async () => result,
    disposeFinalized: async () => result,
  }
  return { client: createMatchRoomClient({ getByName: () => stub }), response }
}

const request = {
  matchId,
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA') },
    { seat: 'B', playerRef: v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB') },
  ],
  controlSecret: 'control-secret-1234567890',
  createdAt: v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000),
} satisfies MatchRoomCreateRequest

describe('MatchRoom RPC response decoding', () => {
  test('rejects malformed results from every structured RPC', async () => {
    const { client } = clientReturning({ ok: 'yes' })
    expect(await client.create(request)).toEqual(invalid)
    expect(await client.readMatch(matchId, 'free-pyramid')).toEqual(invalid)
    expect(
      await client.submitCommand(matchId, newCommandId(), { source: 'match', commandType: 'frame.prepare', command: {} }),
    ).toEqual(invalid)
    expect(await client.listFacts(matchId)).toEqual(invalid)
    expect(await client.finalization(matchId)).toEqual(invalid)
    expect(await client.disposeFinalized(matchId)).toEqual(invalid)
  })

  test('enforces request identity and room read projection coherence', async () => {
    expect(await clientReturning({ ok: true, matchId: otherMatchId }).client.create(request)).toEqual(invalid)
    expect(
      await clientReturning({ ...roomRead, state: { ...state, matchId: otherMatchId } }).client.readMatch(
        matchId,
        'free-pyramid',
      ),
    ).toEqual(invalid)
    expect(await clientReturning(roomRead).client.readMatch(matchId, 'combined-pyramid')).toEqual(invalid)
    expect(
      await clientReturning({ ...roomRead, controlProjection: undefined }).client.readMatch(matchId, 'free-pyramid'),
    ).toEqual(invalid)
    expect(
      await clientReturning({
        ...roomRead,
        controlProjection: { ...controlProjection, gameKey: 'combined-pyramid' },
      }).client.readMatch(matchId, 'free-pyramid'),
    ).toEqual(invalid)
  })

  test('decodes a coherent room read and rejects malformed cursor, sections, and failures', async () => {
    expect(await clientReturning(roomRead).client.readMatch(matchId, 'free-pyramid')).toEqual(roomRead)
    expect(await clientReturning({ ...roomRead, latestSeq: 0 }).client.readMatch(matchId, 'free-pyramid')).toEqual(invalid)
    expect(await clientReturning({ ...roomRead, latestSeq: -1 }).client.readMatch(matchId, 'free-pyramid')).toEqual(invalid)
    expect(
      await clientReturning({ ...roomRead, state: { ...state, status: 'finished' } }).client.readMatch(matchId, 'free-pyramid'),
    ).toEqual(invalid)
    expect(await clientReturning({ ...roomRead, controlSections: {} }).client.readMatch(matchId, 'free-pyramid')).toEqual(
      invalid,
    )
    expect(
      await clientReturning({ ok: false, error: 'failure', status: 200 }).client.readMatch(matchId, 'free-pyramid'),
    ).toEqual(invalid)
    expect(await clientReturning({ ok: false, error: '', status: 700 }).client.readMatch(matchId, 'free-pyramid')).toEqual(
      invalid,
    )
  })

  test('validates command receipts and disposal responses', async () => {
    const command = { source: 'match' as const, commandType: 'frame.prepare', command: {} }
    expect(
      await clientReturning({ ok: true, outcome: { _tag: 'accepted', accepted: [] } }).client.submitCommand(
        matchId,
        newCommandId(),
        command,
      ),
    ).toEqual(invalid)
    expect(
      await clientReturning({ ok: true, outcome: { _tag: 'unknown' } }).client.submitCommand(matchId, newCommandId(), command),
    ).toEqual(invalid)
    expect(await clientReturning({ ok: true }).client.disposeFinalized(matchId)).toEqual({ ok: true })
    expect(await clientReturning({ ok: false, error: 1, status: 500 }).client.disposeFinalized(matchId)).toEqual(invalid)
  })

  test('validates fact identity and finalization projection identity', async () => {
    expect(await clientReturning({ ok: true, facts: [] }).client.listFacts(matchId)).toEqual(invalid)
    expect(await clientReturning({ ok: true, facts: [{ matchId: otherMatchId }] }).client.listFacts(matchId)).toEqual(invalid)
    expect(
      await clientReturning({
        ok: true,
        data: {
          sourceLatestSeq: 1,
          endedAt: 1_700_000_000_000,
          facts: [],
          projection: roomRead,
        },
      }).client.finalization(matchId),
    ).toEqual(invalid)
    expect(await clientReturning({ ok: true, facts: [creationFact] }).client.listFacts(matchId)).toEqual({
      ok: true as const,
      facts: [creationFact],
    })
    const finishedState = {
      ...state,
      status: 'finished' as const,
      framesWonBySeat: { A: 1, B: 0 },
      frames: [{ ...state.frames[0]!, winnerSeat: 'A' as const }],
    }
    const finalization = {
      ok: true as const,
      data: {
        sourceLatestSeq: 1,
        endedAt: v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000),
        facts: [creationFact],
        projection: { state: finishedState, controlSections: emptyControlCommandSections() },
      },
    }
    expect(
      await clientReturning({
        ...finalization,
        data: { ...finalization.data, projection: roomRead },
      }).client.finalization(matchId),
    ).toEqual(invalid)
    expect(await clientReturning(finalization).client.finalization(matchId)).toEqual({
      ...finalization,
      data: { ...finalization.data, projection: { ...finalization.data.projection, controlProjection: undefined } },
    })
    expect(
      await clientReturning({
        ...finalization,
        data: {
          ...finalization.data,
          projection: { ...finalization.data.projection, state: { ...finishedState, matchId: otherMatchId } },
        },
      }).client.finalization(matchId),
    ).toEqual(invalid)
  })

  test('passes stream responses through and does not catch transport failures', async () => {
    const { client, response } = clientReturning(roomRead)
    expect(await client.stream(matchId)).toBe(response)
    const error = new Error('transport')
    const failing = createMatchRoomClient({
      getByName: () => ({
        create: async () => {
          throw error
        },
        readMatch: async () => roomRead,
        submitCommand: async () => invalid,
        stream: async () => response,
        listFacts: async () => invalid,
        finalization: async () => invalid,
        disposeFinalized: async () => invalid,
      }),
    })
    await expect(failing.create(request)).rejects.toBe(error)
  })
})

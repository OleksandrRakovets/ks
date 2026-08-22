import { describe, expect, test } from 'bun:test'

import { buildMatchConfig, CreateMatchRequestSchema, createSparringMatchSession } from '@ks/competition'
import { MatchIdSchema, newCommandId } from '@ks/core'
import * as v from 'valibot'

import { wrapRoomSnapshot } from './active-game'
import {
  canonicalCommandJson,
  CreateBodySchema,
  SnapshotBodySchema,
  StreamBodySchema,
  SubmitCommandBodySchema,
} from './rpc-contract'

const matchId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const controlSecret = 'control-secret-1234567890'

const createRequest = v.parse(CreateMatchRequestSchema, {
  gameKey: 'strila-v2',
  targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 3 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA' },
    { seat: 'B', playerRef: 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB' },
  ],
})

describe('MatchRoom RPC request contract', () => {
  test('wraps production session projection through the MatchRoom seam', () => {
    const config = buildMatchConfig(v.parse(MatchIdSchema, matchId), createRequest)
    const session = createSparringMatchSession(config)
    const snapshot = wrapRoomSnapshot(session.project(1))

    expect(snapshot.controlProjection).toBeUndefined()
    expect(snapshot.controlSections.neutral[0]?.commandType).toBe('frame.start')
    expect(snapshot.snapshot.status).toBe('active')
  })

  test('accepts the create request sent by the application adapter', () => {
    expect(
      v.safeParse(CreateBodySchema, {
        matchId,
        controlSecret,
        createdAt: 1_700_000_000_000,
        gameKey: 'free-pyramid',
        targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 3 },
        firstBreakerSeat: 'A',
        participants: [
          { seat: 'A', playerRef: 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA' },
          { seat: 'B', playerRef: 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB' },
        ],
      }).success,
    ).toBe(true)
  })

  test('canonicalizes parsed commands with stable key order and distinct payloads', () => {
    expect(canonicalCommandJson({ source: 'match', commandType: 'frame.start', command: {} })).toBe(
      JSON.stringify({ source: 'match', commandType: 'frame.start', command: {} }),
    )
    expect(canonicalCommandJson({ source: 'match', commandType: 'frame.start', command: {} })).toBe(
      canonicalCommandJson({ command: {}, commandType: 'frame.start', source: 'match' }),
    )
    expect(canonicalCommandJson({ source: 'match', commandType: 'match.end', command: {} })).not.toBe(
      canonicalCommandJson({ source: 'match', commandType: 'frame.start', command: {} }),
    )
  })

  test('accepts commands without a control secret and rejects invalid IDs', () => {
    expect(v.safeParse(SnapshotBodySchema, { matchId }).success).toBe(true)
    expect(
      v.safeParse(SubmitCommandBodySchema, {
        matchId,
        commandId: newCommandId(),
        command: { source: 'match', commandType: 'frame.start', command: {} },
      }).success,
    ).toBe(true)
    expect(v.safeParse(StreamBodySchema, { matchId, since: 2 }).success).toBe(true)
    expect(v.safeParse(SnapshotBodySchema, { matchId: 'not-a-match-id' }).success).toBe(false)
  })
})

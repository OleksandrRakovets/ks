import { describe, expect, test } from 'bun:test'

import { newCommandId } from '@ks/core'
import * as v from 'valibot'

import {
  canonicalCommandJson,
  CreateBodySchema,
  MatchIdBodySchema,
  StreamBodySchema,
  SubmitCommandBodySchema,
} from './rpc-contract'

const matchId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const controlSecret = 'control-secret-1234567890'

describe('MatchRoom RPC request contract', () => {
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
    expect(v.safeParse(MatchIdBodySchema, { matchId }).success).toBe(true)
    expect(
      v.safeParse(SubmitCommandBodySchema, {
        matchId,
        commandId: newCommandId(),
        command: { source: 'match', commandType: 'frame.start', command: {} },
      }).success,
    ).toBe(true)
    expect(v.safeParse(StreamBodySchema, { matchId, since: 2 }).success).toBe(true)
    expect(v.safeParse(MatchIdBodySchema, { matchId: 'not-a-match-id' }).success).toBe(false)
  })
})

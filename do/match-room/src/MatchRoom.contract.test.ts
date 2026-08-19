import { describe, expect, test } from 'bun:test'

import { newCommandId } from '@ks/core'
import * as v from 'valibot'

import { CreateBodySchema, FactsBodySchema, SnapshotBodySchema, StreamBodySchema } from './rpc-contract'

const matchId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const controlSecret = 'control-secret-1234567890'

describe('MatchRoom RPC request contract', () => {
  test('accepts the create request sent by the application adapter', () => {
    expect(
      v.safeParse(CreateBodySchema, {
        matchId,
        controlSecret,
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

  test('accepts adapter snapshot, command, and stream shapes and rejects invalid IDs', () => {
    expect(v.safeParse(SnapshotBodySchema, { matchId }).success).toBe(true)
    expect(
      v.safeParse(FactsBodySchema, {
        matchId,
        controlSecret,
        commandId: newCommandId(),
        commands: [{ source: 'match', commandType: 'frame.start', command: {} }],
      }).success,
    ).toBe(true)
    expect(v.safeParse(StreamBodySchema, { matchId, since: 2 }).success).toBe(true)
    expect(v.safeParse(SnapshotBodySchema, { matchId: 'not-a-match-id' }).success).toBe(false)
  })
})

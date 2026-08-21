import { describe, expect, test } from 'bun:test'

import type { MatchState } from '@ks/competition'
import { MatchIdSchema, newCommandId } from '@ks/core'
import { createInitialGameState } from '@ks/gameplay/server'
import * as v from 'valibot'

import { type ActiveGameState, assembleRoomSnapshot, deriveActiveGameSummary } from './active-game'
import { CreateBodySchema, FactsBodySchema, SnapshotBodySchema, StreamBodySchema } from './rpc-contract'

const matchId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const controlSecret = 'control-secret-1234567890'

function matchState(winnerSeat?: 'A' | 'B'): MatchState {
  const frame: MatchState['frames'][number] = {
    frameIndex: 1,
    pointsBySeat: { A: 0, B: 0 },
    breakerSeat: 'A',
  }
  return {
    config: {
      matchId: v.parse(MatchIdSchema, matchId),
      gameKey: 'strila-v2',
      targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 3 },
      firstBreakerSeat: 'A',
    },
    status: 'active',
    currentFrameIndex: 1,
    framesWonBySeat: { A: winnerSeat === 'A' ? 1 : 0, B: winnerSeat === 'B' ? 1 : 0 },
    frames: [winnerSeat ? { ...frame, winnerSeat } : frame],
  }
}

describe('MatchRoom RPC request contract', () => {
  test('executes active control and summary projection through the MatchRoom seam', () => {
    const active: ActiveGameState<'strila-v2'> = {
      gameKey: 'strila-v2',
      state: createInitialGameState('strila-v2', { targetPointsBySeat: { A: 9, B: 9 }, breakerSeat: 'A' }),
    }

    const snapshot = assembleRoomSnapshot(matchState(), active, 2)
    expect(snapshot.controlProjection).toMatchObject({
      gameKey: 'strila-v2',
      projection: 'control',
      details: { phase: 'not-started' },
    })
    expect(deriveActiveGameSummary(active)).toEqual({
      gameKey: 'strila-v2',
      projection: 'summary',
      score: { A: 0, B: 0 },
      details: { phase: 'not-started' },
    })
    expect(snapshot.controlSections.primary.A[0]?.commandType).toBe('frame.commence')
  })

  test('returns no control projection between frames', () => {
    expect(assembleRoomSnapshot(matchState('A'), null, 3).controlProjection).toBeUndefined()
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

  test('accepts commands without a control secret and rejects invalid IDs', () => {
    expect(v.safeParse(SnapshotBodySchema, { matchId }).success).toBe(true)
    expect(
      v.safeParse(FactsBodySchema, {
        matchId,
        commandId: newCommandId(),
        command: { source: 'match', commandType: 'frame.start', command: {} },
      }).success,
    ).toBe(true)
    expect(v.safeParse(StreamBodySchema, { matchId, since: 2 }).success).toBe(true)
    expect(v.safeParse(SnapshotBodySchema, { matchId: 'not-a-match-id' }).success).toBe(false)
  })
})

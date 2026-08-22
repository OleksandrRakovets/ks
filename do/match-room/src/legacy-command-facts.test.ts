import { describe, expect, test } from 'bun:test'

import { emptyMatchState } from '@ks/competition'
import { MatchIdSchema, newCommandId } from '@ks/core'
import { createInitialGameState } from '@ks/gameplay/server'
import * as v from 'valibot'

import { legacyCommandFacts } from './legacy-command-facts'
import { createTestStore } from './storage/test-helpers'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')

function roomWithConfig() {
  return {
    matchState: {
      ...emptyMatchState(),
      config: {
        matchId,
        gameKey: 'strila-v2' as const,
        targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 3 },
        firstBreakerSeat: 'A' as const,
      },
      currentFrameIndex: 0,
    },
    currentFrame: null,
  }
}

describe('legacyCommandFacts', () => {
  test('returns null for unsupported commands without throwing', () => {
    const store = createTestStore()
    const commandId = newCommandId()
    expect(
      legacyCommandFacts(roomWithConfig(), { source: 'match', commandType: 'unknown.command', command: {} }, commandId),
    ).toBeNull()
    expect(store.receipt(commandId)).toBeNull()
  })

  test('returns null when no active frame exists for frame-scoped commands', () => {
    expect(
      legacyCommandFacts(
        roomWithConfig(),
        { source: 'match', commandType: 'frame.commence', command: { seat: 'A' } },
        newCommandId(),
      ),
    ).toBeNull()
  })

  test('throws when match config is missing', () => {
    expect(() =>
      legacyCommandFacts(
        { matchState: emptyMatchState(), currentFrame: null },
        { source: 'match', commandType: 'frame.start', command: {} },
        newCommandId(),
      ),
    ).toThrow('Missing match config')
  })

  test('returns facts for a valid frame.start command', () => {
    const facts = legacyCommandFacts(
      roomWithConfig(),
      { source: 'match', commandType: 'frame.start', command: {} },
      newCommandId(),
    )
    expect(facts?.length).toBe(1)
    expect(facts?.[0]?.type).toBe('frame.started')
  })

  test('returns null for rejected gameplay commands', () => {
    const currentFrame = {
      gameKey: 'strila-v2' as const,
      state: createInitialGameState('strila-v2', { targetPointsBySeat: { A: 9, B: 9 }, breakerSeat: 'A' }),
    }
    const facts = legacyCommandFacts(
      {
        matchState: {
          ...roomWithConfig().matchState,
          currentFrameIndex: 1,
          frames: [{ frameIndex: 1, pointsBySeat: { A: 0, B: 0 }, breakerSeat: 'A' }],
        },
        currentFrame,
      },
      { source: 'game', commandType: 'unsupported.game.command', command: {} },
      newCommandId(),
    )
    expect(facts).toBeNull()
  })
})

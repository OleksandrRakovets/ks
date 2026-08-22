import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import {
  FrameCompletedFactSchema,
  GameCommandFactSchema,
  MatchCreatedFactSchema,
  MatchEndedFactSchema,
  MatchFactSchema,
  StoredMatchFactSchema,
} from './facts'
import { CommandIdSchema, FactIdSchema, MatchIdSchema } from './ids'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const otherMatchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAA')
const factId = v.parse(FactIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAB')
const commandId = v.parse(CommandIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAC')

const matchConfig = {
  matchId,
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A' as const,
}

function storedMatchCreated(envelopeMatchId: string, payloadMatchId: string, gameKey = 'free-pyramid') {
  return {
    seq: 1,
    factId,
    matchId: envelopeMatchId,
    occurredAt: 1_700_000_000_000,
    receivedAt: 1_700_000_000_001,
    causedByCommandId: null,
    type: 'match.created',
    payload: {
      matchId: payloadMatchId,
      gameKey,
      targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
      firstBreakerSeat: 'A',
    },
  }
}

describe('stored match fact identity', () => {
  test('rejects mismatched match.created envelope and payload IDs', () => {
    expect(v.safeParse(StoredMatchFactSchema, storedMatchCreated(matchId, otherMatchId)).success).toBe(false)
  })

  test('decodes a syntactically valid historical game key without requiring a registered runtime', () => {
    const fact = v.parse(StoredMatchFactSchema, storedMatchCreated(matchId, matchId, 'historical-game'))
    expect(fact.type).toBe('match.created')
    if (fact.type !== 'match.created') throw new Error('Expected match.created fact')
    expect(fact.payload.gameKey).toBe('historical-game')
  })

  test('requires null causation on match.created', () => {
    expect(
      v.safeParse(MatchCreatedFactSchema, {
        factId,
        matchId,
        occurredAt: 1,
        type: 'match.created',
        payload: matchConfig,
      }).success,
    ).toBe(false)
  })

  test('rejects match.created with command causation', () => {
    expect(
      v.safeParse(MatchCreatedFactSchema, {
        factId,
        matchId,
        occurredAt: 1,
        causedByCommandId: commandId,
        type: 'match.created',
        payload: matchConfig,
      }).success,
    ).toBe(false)
  })

  test('rejects null causation on submitted-command facts', () => {
    expect(
      v.safeParse(GameCommandFactSchema, {
        factId,
        matchId,
        occurredAt: 1,
        causedByCommandId: null,
        type: 'game.command',
        payload: {
          frameIndex: 1,
          gameKey: 'free-pyramid',
          commandType: 'frame.commence',
          command: { seat: 'A' },
          protocolEntries: [{ source: 'player', entryType: 'player-command', body: { commandType: 'frame.commence' } }],
        },
      }).success,
    ).toBe(false)
  })

  test('requires command causation on submitted-command facts', () => {
    expect(
      v.safeParse(GameCommandFactSchema, {
        factId,
        matchId,
        occurredAt: 1,
        type: 'game.command',
        payload: {
          frameIndex: 1,
          gameKey: 'free-pyramid',
          commandType: 'frame.commence',
          command: { seat: 'A' },
          protocolEntries: [{ source: 'player', entryType: 'player-command', body: { commandType: 'frame.commence' } }],
        },
      }).success,
    ).toBe(false)
  })

  test('rejects empty game protocol entries', () => {
    expect(
      v.safeParse(MatchFactSchema, {
        factId,
        matchId,
        occurredAt: 1,
        causedByCommandId: commandId,
        type: 'game.command',
        payload: {
          frameIndex: 1,
          gameKey: 'free-pyramid',
          commandType: 'frame.commence',
          command: { seat: 'A' },
          protocolEntries: [],
        },
      }).success,
    ).toBe(false)
  })

  test('rejects non-positive stored sequence', () => {
    expect(v.safeParse(StoredMatchFactSchema, { ...storedMatchCreated(matchId, matchId), seq: 0 }).success).toBe(false)
  })

  test('accepts all submitted-command variants with causation', () => {
    const base = { factId, matchId, occurredAt: 1, causedByCommandId: commandId }
    expect(
      v.safeParse(FrameCompletedFactSchema, {
        ...base,
        type: 'frame.completed',
        payload: {
          frameIndex: 1,
          gameKey: 'free-pyramid',
          outcome: { winnerSeat: 'A', score: { A: 8, B: 4 }, winReason: 'target-reached' },
        },
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(MatchEndedFactSchema, {
        ...base,
        type: 'match.ended',
        payload: { winnerSeat: 'A' },
      }).success,
    ).toBe(true)
  })
})

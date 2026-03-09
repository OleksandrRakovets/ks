import { newClientId, newEventId, newMatchId, type ClientEvent, type MatchConfig } from '@ks/core'
import { describe, expect, test } from 'bun:test'

import { applyEvent, emptyState } from '../src'

function baseEvent(matchId: string, type: ClientEvent['type'], payload: unknown): ClientEvent {
  return {
    eventId: newEventId(),
    matchId,
    clientId: newClientId(),
    clientSeq: 1,
    at: Date.now(),
    type,
    payload,
  } as ClientEvent
}

function makeConfig(gameKey: MatchConfig['gameKey']): MatchConfig {
  const matchId = newMatchId()
  return {
    matchId,
    gameKey,
    targets: {
      frameTargetPointsBySeat: { A: 8, B: 8 },
      matchTargetFramesBySeat: { A: 3, B: 3 },
    },
    participants: [
      { seat: 'A', displayName: 'A' },
      { seat: 'B', displayName: 'B' },
    ],
  }
}

describe('free-pyramid', () => {
  test('does not go below zero', () => {
    const config = makeConfig('free-pyramid')
    let s = emptyState()
    s = applyEvent(s, baseEvent(config.matchId, 'match.created', config))
    s = applyEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
    s = applyEvent(
      s,
      baseEvent(config.matchId, 'game.command', {
        gameKey: config.gameKey,
        commandType: 'shot.recorded',
        command: { seat: 'A', points: 1 },
      }),
    )
    s = applyEvent(
      s,
      baseEvent(config.matchId, 'game.command', {
        gameKey: config.gameKey,
        commandType: 'shot.recorded',
        command: { seat: 'A', points: -10 },
      }),
    )
    expect(s.frames[0]?.pointsBySeat.A).toBe(0)
  })
})

describe('combined-pyramid-old', () => {
  test('can go negative', () => {
    const config = makeConfig('combined-pyramid-old')
    let s = emptyState()
    s = applyEvent(s, baseEvent(config.matchId, 'match.created', config))
    s = applyEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
    s = applyEvent(
      s,
      baseEvent(config.matchId, 'game.command', {
        gameKey: config.gameKey,
        commandType: 'shot.recorded',
        command: { seat: 'A', points: -2 },
      }),
    )
    expect(s.frames[0]?.pointsBySeat.A).toBe(-2)
  })
})

test('frame award increments framesWon', () => {
  const config = makeConfig('free-pyramid')
  let s = emptyState()
  s = applyEvent(s, baseEvent(config.matchId, 'match.created', config))
  s = applyEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
  s = applyEvent(s, baseEvent(config.matchId, 'frame.awarded', { frameIndex: 1, winnerSeat: 'A' }))
  expect(s.framesWonBySeat.A).toBe(1)
})

import { describe, expect, test } from 'bun:test'

import { ClientEventSchema, newClientId, newEventId, newMatchId, type ClientEvent, type MatchConfig } from '@ks/core'

import { applyMatchEvent, deriveMatchLifecycleDecisions, emptyMatchState, snapshotFromMatchState } from './index'

function baseEvent<TType extends ClientEvent['type']>(
  matchId: string,
  type: TType,
  payload: Extract<ClientEvent, { type: TType }>['payload'],
): ClientEvent {
  return ClientEventSchema.parse({
    eventId: newEventId(),
    matchId,
    clientId: newClientId(),
    clientSeq: 1,
    at: Date.now(),
    type,
    payload,
  })
}

function makeConfig(gameKey: MatchConfig['gameKey'], matchTargetFrames = 3): MatchConfig {
  const matchId = newMatchId()
  return {
    matchId,
    gameKey,
    targets: {
      frameTargetPointsBySeat: { A: 8, B: 8 },
      matchTargetFrames,
    },
  }
}

describe('free-pyramid', () => {
  test('does not go below zero', () => {
    const config = makeConfig('free-pyramid')
    let s = emptyMatchState()
    s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
    s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
    s = applyMatchEvent(
      s,
      baseEvent(config.matchId, 'game.command', {
        gameKey: config.gameKey,
        commandType: 'break-off',
        command: { seat: 'A' },
      }),
    )
    s = applyMatchEvent(
      s,
      baseEvent(config.matchId, 'game.command', {
        gameKey: config.gameKey,
        commandType: 'shot.recorded',
        command: { seat: 'A', points: 1 },
      }),
    )
    s = applyMatchEvent(
      s,
      baseEvent(config.matchId, 'game.command', {
        gameKey: config.gameKey,
        commandType: 'shot.recorded',
        command: { seat: 'A', points: -10 },
      }),
    )
    expect(s.frames[0]?.pointsBySeat.A).toBe(0)
    expect(s.frames[0]?.gameState).toEqual({
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
    })
  })

  test('starts frame with initial game state', () => {
    const config = makeConfig('free-pyramid')
    let s = emptyMatchState()
    s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
    s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))

    expect(s.frames[0]?.gameState).toEqual({
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'not-started',
    })
  })
})

describe('combined-pyramid-old', () => {
  test('can go negative', () => {
    const config = makeConfig('combined-pyramid-old')
    let s = emptyMatchState()
    s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
    s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
    s = applyMatchEvent(
      s,
      baseEvent(config.matchId, 'game.command', {
        gameKey: config.gameKey,
        commandType: 'break-off',
        command: { seat: 'A' },
      }),
    )
    s = applyMatchEvent(
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
  let s = emptyMatchState()
  s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.awarded', { frameIndex: 1, winnerSeat: 'A' }))
  expect(s.framesWonBySeat.A).toBe(1)
})

test('strila award-frame closes the match frame through gameplay', () => {
  const config = makeConfig('strila-v2')
  let s = emptyMatchState()
  s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'break-off',
      command: { actor: 'A' },
    }),
  )
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'concede-frame',
      command: { actor: 'B' },
    }),
  )

  expect(s.frames[0]?.winnerSeat).toBeUndefined()

  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'award-frame',
      command: { actor: 'A' },
    }),
  )

  expect(s.frames[0]?.winnerSeat).toBe('A')
  expect(s.framesWonBySeat.A).toBe(1)
})

test('strila handicap target lets A reach winner-determined at 6', () => {
  const config = makeConfig('strila-v2')
  config.targets.frameTargetPointsBySeat = { A: 6, B: 9 }

  let s = emptyMatchState()
  s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'break-off',
      command: { actor: 'A' },
    }),
  )
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [1] },
    }),
  )
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [2] },
    }),
  )
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [3] },
    }),
  )

  expect(s.frames[0]?.pointsBySeat).toEqual({ A: 6, B: 0 })
  expect(s.frames[0]?.winnerSeat).toBeUndefined()

  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'award-frame',
      command: { actor: 'A' },
    }),
  )

  expect(s.frames[0]?.winnerSeat).toBe('A')
  expect(s.framesWonBySeat.A).toBe(1)
})

test('free-pyramid award-frame closes the match frame through gameplay', () => {
  const config = makeConfig('free-pyramid')
  let s = emptyMatchState()
  s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'break-off',
      command: { seat: 'A' },
    }),
  )
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'shot.recorded',
      command: { seat: 'A', points: 8 },
    }),
  )
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'shot.recorded',
      command: { seat: 'A', points: 2 },
    }),
  )

  expect(s.frames[0]?.winnerSeat).toBeUndefined()

  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'award-frame',
      command: { seat: 'A' },
    }),
  )

  expect(s.frames[0]?.winnerSeat).toBe('A')
  expect(s.framesWonBySeat.A).toBe(1)
})

test('free-pyramid allows break above frame target before frame award', () => {
  const config = makeConfig('free-pyramid')
  let s = emptyMatchState()
  s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'break-off',
      command: { seat: 'A' },
    }),
  )
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'shot.recorded',
      command: { seat: 'A', points: 8 },
    }),
  )
  s = applyMatchEvent(
    s,
    baseEvent(config.matchId, 'game.command', {
      gameKey: config.gameKey,
      commandType: 'shot.recorded',
      command: { seat: 'A', points: 2 },
    }),
  )

  expect(s.frames[0]?.pointsBySeat.A).toBe(10)
  expect(s.frames[0]?.winnerSeat).toBeUndefined()
})

test('can start next frame before match target is reached', () => {
  const config = makeConfig('free-pyramid', 2)
  let s = emptyMatchState()
  s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.awarded', { frameIndex: 1, winnerSeat: 'A' }))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 2 }))
  expect(s.currentFrameIndex).toBe(2)
})

test('cannot start next frame after match target is reached', () => {
  const config = makeConfig('free-pyramid', 1)
  let s = emptyMatchState()
  s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.awarded', { frameIndex: 1, winnerSeat: 'A' }))

  expect(() => applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 2 }))).toThrow(
    'Cannot start new frame after match target is reached',
  )
})

test('final frame still requires explicit match.ended event', () => {
  const config = makeConfig('free-pyramid', 1)
  let s = emptyMatchState()
  s = applyMatchEvent(s, baseEvent(config.matchId, 'match.created', config))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.started', { frameIndex: 1 }))
  s = applyMatchEvent(s, baseEvent(config.matchId, 'frame.awarded', { frameIndex: 1, winnerSeat: 'A' }))
  expect(s.status).toBe('active')

  const snapshot = snapshotFromMatchState(s, 3)
  const decisionsBeforeEnd = deriveMatchLifecycleDecisions(snapshot)
  expect(decisionsBeforeEnd.canStartNextFrame).toBe(false)
  expect(decisionsBeforeEnd.canEndMatch).toBe(true)

  s = applyMatchEvent(s, baseEvent(config.matchId, 'match.ended', { reason: 'target-reached' }))
  expect(s.status).toBe('finished')
})

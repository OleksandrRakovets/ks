import { describe, expect, test } from 'bun:test'

import { ClientEventSchema, newClientId, newEventId, newMatchId, type ClientEvent, type MatchConfig } from '@ks/core'

import { applyMatchEvent, deriveSparringControlSections, emptyMatchState } from './index'

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

function makeConfig(matchTargetFrames = 3): MatchConfig {
  const matchId = newMatchId()
  return {
    matchId,
    gameKey: 'free-pyramid',
    targets: {
      frameTargetPointsBySeat: { A: 8, B: 8 },
      matchTargetFrames,
    },
  }
}

function frameStarted(config: MatchConfig, frameIndex: number): ClientEvent {
  return baseEvent(config.matchId, 'frame.started', {
    frameIndex,
    gameKey: config.gameKey,
    targetPointsBySeat: config.targets.frameTargetPointsBySeat,
  })
}

function frameCompleted(config: MatchConfig, frameIndex: number, winnerSeat: 'A' | 'B', score = { A: 8, B: 4 }): ClientEvent {
  return baseEvent(config.matchId, 'frame.completed', {
    frameIndex,
    gameKey: config.gameKey,
    outcome: {
      winnerSeat,
      score,
      winReason: 'target-reached',
    },
  })
}

describe('match-state room facts', () => {
  test('starts frame from resolved frame.started fact', () => {
    const config = makeConfig()
    let state = emptyMatchState()

    state = applyMatchEvent(state, baseEvent(config.matchId, 'match.created', config))
    state = applyMatchEvent(state, frameStarted(config, 1))

    expect(state.currentFrameIndex).toBe(1)
    expect(state.frames).toEqual([{ frameIndex: 1, pointsBySeat: { A: 0, B: 0 } }])
  })

  test('game.command is accepted input fact but does not mutate match score', () => {
    const config = makeConfig()
    let state = emptyMatchState()

    state = applyMatchEvent(state, baseEvent(config.matchId, 'match.created', config))
    state = applyMatchEvent(state, frameStarted(config, 1))
    state = applyMatchEvent(
      state,
      baseEvent(config.matchId, 'game.command', {
        frameIndex: 1,
        gameKey: config.gameKey,
        commandType: 'pot.record',
        command: { seat: 'A', points: 8 },
        protocolEntries: [
          {
            source: 'player',
            entryType: 'player-command',
            seat: 'A',
            scoreAfter: { A: 8, B: 0 },
            body: { commandType: 'pot.record', points: 8 },
          },
        ],
      }),
    )

    expect(state.frames[0]?.pointsBySeat).toEqual({ A: 0, B: 0 })
    expect(state.frames[0]?.winnerSeat).toBeUndefined()
  })

  test('frame.completed records outcome and increments frames won', () => {
    const config = makeConfig()
    let state = emptyMatchState()

    state = applyMatchEvent(state, baseEvent(config.matchId, 'match.created', config))
    state = applyMatchEvent(state, frameStarted(config, 1))
    state = applyMatchEvent(state, frameCompleted(config, 1, 'A', { A: 10, B: 4 }))

    expect(state.frames[0]).toEqual({ frameIndex: 1, pointsBySeat: { A: 10, B: 4 }, winnerSeat: 'A' })
    expect(state.framesWonBySeat).toEqual({ A: 1, B: 0 })
  })

  test('can start next frame before match target is reached', () => {
    const config = makeConfig(2)
    let state = emptyMatchState()

    state = applyMatchEvent(state, baseEvent(config.matchId, 'match.created', config))
    state = applyMatchEvent(state, frameStarted(config, 1))
    state = applyMatchEvent(state, frameCompleted(config, 1, 'A'))
    state = applyMatchEvent(state, frameStarted(config, 2))

    expect(state.currentFrameIndex).toBe(2)
  })

  test('cannot start next frame after match target is reached', () => {
    const config = makeConfig(1)
    let state = emptyMatchState()

    state = applyMatchEvent(state, baseEvent(config.matchId, 'match.created', config))
    state = applyMatchEvent(state, frameStarted(config, 1))
    state = applyMatchEvent(state, frameCompleted(config, 1, 'A'))

    expect(() => applyMatchEvent(state, frameStarted(config, 2))).toThrow(
      'Cannot start new frame after match target is reached',
    )
  })

  test('final frame still requires explicit match.ended event', () => {
    const config = makeConfig(1)
    let state = emptyMatchState()

    state = applyMatchEvent(state, baseEvent(config.matchId, 'match.created', config))
    state = applyMatchEvent(state, frameStarted(config, 1))
    state = applyMatchEvent(state, frameCompleted(config, 1, 'A'))
    expect(state.status).toBe('active')

    const sectionsBeforeEnd = deriveSparringControlSections({ matchState: state })
    expect(sectionsBeforeEnd.neutral.map((command) => command.commandType)).toEqual(['match.end'])

    state = applyMatchEvent(state, baseEvent(config.matchId, 'match.ended', { winnerSeat: 'A' }))
    expect(state.status).toBe('finished')
  })

  test('rejects match.ended before target is reached', () => {
    const config = makeConfig(2)
    let state = emptyMatchState()

    state = applyMatchEvent(state, baseEvent(config.matchId, 'match.created', config))
    state = applyMatchEvent(state, frameStarted(config, 1))
    state = applyMatchEvent(state, frameCompleted(config, 1, 'A'))

    expect(() => applyMatchEvent(state, baseEvent(config.matchId, 'match.ended', { winnerSeat: 'A' }))).toThrow(
      'Cannot end match before target',
    )
  })

  test('frame.reopened is reserved until undo controller owns semantics', () => {
    const config = makeConfig()
    let state = emptyMatchState()

    state = applyMatchEvent(state, baseEvent(config.matchId, 'match.created', config))
    state = applyMatchEvent(state, frameStarted(config, 1))
    state = applyMatchEvent(state, frameCompleted(config, 1, 'A'))

    expect(() => applyMatchEvent(state, baseEvent(config.matchId, 'frame.reopened', { frameIndex: 1 }))).toThrow(
      'TODO: frame.reopened is reserved for undo controller',
    )
  })
})

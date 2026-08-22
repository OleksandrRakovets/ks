import { describe, expect, test } from 'bun:test'

import { type MatchConfig, type MatchFact, MatchFactSchema, newCommandId, newFactId, newMatchId } from '@ks/core'
import * as v from 'valibot'

import { applyMatchFact, deriveMatchState, deriveSparringControlSections, emptyMatchState, MatchStateSchema } from './index'

const commandId = newCommandId()

function baseFact<TType extends MatchFact['type']>(
  matchId: string,
  type: TType,
  payload: Extract<MatchFact, { type: TType }>['payload'],
): MatchFact {
  const envelope = {
    factId: newFactId(),
    matchId,
    occurredAt: Date.now(),
    type,
    payload,
    causedByCommandId: type === 'match.created' ? null : commandId,
  }
  return v.parse(MatchFactSchema, envelope)
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
    firstBreakerSeat: 'A',
  }
}

function frameStarted(config: MatchConfig, frameIndex: number): MatchFact {
  return baseFact(config.matchId, 'frame.started', {
    frameIndex,
    gameKey: config.gameKey,
    targetPointsBySeat: config.targets.frameTargetPointsBySeat,
    breakerSeat: frameIndex % 2 === 1 ? config.firstBreakerSeat : config.firstBreakerSeat === 'A' ? 'B' : 'A',
    gameConfiguration: config.gameConfiguration,
  })
}

function frameCompleted(config: MatchConfig, frameIndex: number, winnerSeat: 'A' | 'B', score = { A: 8, B: 4 }): MatchFact {
  return baseFact(config.matchId, 'frame.completed', {
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
  test('produces schema-valid states at each transition and after replay', () => {
    const config = makeConfig(1)
    const facts = [
      baseFact(config.matchId, 'match.created', config),
      frameStarted(config, 1),
      frameCompleted(config, 1, 'A'),
      baseFact(config.matchId, 'match.ended', { winnerSeat: 'A' }),
    ]
    let state = emptyMatchState()
    expect(v.safeParse(MatchStateSchema, state).success).toBe(true)
    for (const fact of facts) {
      state = applyMatchFact(state, fact)
      expect(v.safeParse(MatchStateSchema, state).success).toBe(true)
    }
    expect(v.safeParse(MatchStateSchema, deriveMatchState(facts)).success).toBe(true)
  })

  test('rejects duplicate match creation instead of resetting aggregate state', () => {
    const config = makeConfig()
    let state = applyMatchFact(emptyMatchState(), baseFact(config.matchId, 'match.created', config))
    state = applyMatchFact(state, frameStarted(config, 1))
    const stateBeforeDuplicate = structuredClone(state)

    expect(() => applyMatchFact(state, baseFact(config.matchId, 'match.created', config))).toThrow(
      'Cannot create an initialized match',
    )
    expect(state).toEqual(stateBeforeDuplicate)
  })

  test('rejects a later fact from another match before mutating state', () => {
    const config = makeConfig()
    const otherConfig = makeConfig()
    const state = applyMatchFact(emptyMatchState(), baseFact(config.matchId, 'match.created', config))

    expect(() => applyMatchFact(state, frameStarted({ ...config, matchId: otherConfig.matchId }, 1))).toThrow(
      'Fact match ID does not match match config',
    )
    expect(state.frames).toEqual([])
    expect(state.currentFrameIndex).toBe(0)
  })

  test('starts frame from resolved frame.started fact', () => {
    const config = makeConfig()
    let state = emptyMatchState()

    state = applyMatchFact(state, baseFact(config.matchId, 'match.created', config))
    state = applyMatchFact(state, frameStarted(config, 1))

    expect(state.currentFrameIndex).toBe(1)
    expect(state.frames).toEqual([{ frameIndex: 1, pointsBySeat: { A: 0, B: 0 }, breakerSeat: 'A' }])
  })

  test('requires frame.started game configuration to match match config', () => {
    const config: MatchConfig = {
      ...makeConfig(1),
      gameKey: 'free-pyramid-long',
      gameConfiguration: { rackRollover: 14 },
    }
    let state = emptyMatchState()

    state = applyMatchFact(state, baseFact(config.matchId, 'match.created', config))

    expect(() =>
      applyMatchFact(
        state,
        baseFact(config.matchId, 'frame.started', {
          frameIndex: 1,
          gameKey: config.gameKey,
          targetPointsBySeat: config.targets.frameTargetPointsBySeat,
          breakerSeat: 'A',
          gameConfiguration: { rackRollover: 15 },
        }),
      ),
    ).toThrow('Started frame game configuration does not match match config')

    state = applyMatchFact(state, frameStarted(config, 1))
    expect(state.currentFrameIndex).toBe(1)
  })

  test('game.command is accepted input fact but does not mutate match score', () => {
    const config = makeConfig()
    let state = emptyMatchState()

    state = applyMatchFact(state, baseFact(config.matchId, 'match.created', config))
    state = applyMatchFact(state, frameStarted(config, 1))
    state = applyMatchFact(
      state,
      baseFact(config.matchId, 'game.command', {
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

    state = applyMatchFact(state, baseFact(config.matchId, 'match.created', config))
    state = applyMatchFact(state, frameStarted(config, 1))
    state = applyMatchFact(state, frameCompleted(config, 1, 'A', { A: 10, B: 4 }))

    expect(state.frames[0]).toEqual({ frameIndex: 1, pointsBySeat: { A: 10, B: 4 }, breakerSeat: 'A', winnerSeat: 'A' })
    expect(state.framesWonBySeat).toEqual({ A: 1, B: 0 })
  })

  test('can start next frame before match target is reached', () => {
    const config = makeConfig(2)
    let state = emptyMatchState()

    state = applyMatchFact(state, baseFact(config.matchId, 'match.created', config))
    state = applyMatchFact(state, frameStarted(config, 1))
    state = applyMatchFact(state, frameCompleted(config, 1, 'A'))
    state = applyMatchFact(state, frameStarted(config, 2))

    expect(state.currentFrameIndex).toBe(2)
    expect(state.frames[1]?.breakerSeat).toBe('B')
  })

  test('rejects frame breaker outside alternating match order', () => {
    const config = makeConfig()
    let state = emptyMatchState()

    state = applyMatchFact(state, baseFact(config.matchId, 'match.created', config))

    expect(() =>
      applyMatchFact(
        state,
        baseFact(config.matchId, 'frame.started', {
          frameIndex: 1,
          gameKey: config.gameKey,
          targetPointsBySeat: config.targets.frameTargetPointsBySeat,
          breakerSeat: 'B',
          gameConfiguration: config.gameConfiguration,
        }),
      ),
    ).toThrow('Frame breaker seat must follow match order')
  })

  test('cannot start next frame after match target is reached', () => {
    const config = makeConfig(1)
    let state = emptyMatchState()

    state = applyMatchFact(state, baseFact(config.matchId, 'match.created', config))
    state = applyMatchFact(state, frameStarted(config, 1))
    state = applyMatchFact(state, frameCompleted(config, 1, 'A'))

    expect(() => applyMatchFact(state, frameStarted(config, 2))).toThrow('Cannot start new frame after match target is reached')
  })

  test('final frame still requires explicit match.ended event', () => {
    const config = makeConfig(1)
    let state = emptyMatchState()

    state = applyMatchFact(state, baseFact(config.matchId, 'match.created', config))
    state = applyMatchFact(state, frameStarted(config, 1))
    state = applyMatchFact(state, frameCompleted(config, 1, 'A'))
    expect(state.status).toBe('active')

    const sectionsBeforeEnd = deriveSparringControlSections({ matchState: state })
    expect(sectionsBeforeEnd.neutral.map((command) => command.commandType)).toEqual(['match.end'])

    state = applyMatchFact(state, baseFact(config.matchId, 'match.ended', { winnerSeat: 'A' }))
    expect(state.status).toBe('finished')
  })

  test('rejects match.ended before target is reached', () => {
    const config = makeConfig(2)
    let state = emptyMatchState()

    state = applyMatchFact(state, baseFact(config.matchId, 'match.created', config))
    state = applyMatchFact(state, frameStarted(config, 1))
    state = applyMatchFact(state, frameCompleted(config, 1, 'A'))

    expect(() => applyMatchFact(state, baseFact(config.matchId, 'match.ended', { winnerSeat: 'A' }))).toThrow(
      'Cannot end match before target',
    )
  })
})

import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { StrilaControlViewSchema, StrilaMeta, StrilaScoreboardViewSchema, StrilaSummaryViewSchema } from './definitions'
import { StrilaGameplayRuntime, type StrilaFrameState } from './runtime'

function apply(
  runtime: StrilaGameplayRuntime,
  state: StrilaFrameState,
  command: { type: string; [key: string]: unknown },
): StrilaFrameState {
  return runtime.parseState(runtime.applyCommand({ state, commandType: command.type, command }).state)
}

describe('StrilaGameplayRuntime projections', () => {
  test('derives valid control projection from machine state', () => {
    const runtime = new StrilaGameplayRuntime()
    let state = runtime.createInitialState({ targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    state = apply(runtime, state, { type: 'frame.commence', seat: 'A' })
    state = apply(runtime, state, { type: 'foul.commit', seat: 'A' })

    const projection = v.parse(StrilaControlViewSchema, runtime.deriveProjection({ state, projection: 'control' }))

    expect(projection.details.phase).toBe('foul-committed.penalty-selection')
    expect(projection.details.seat).toBe('B')
    expect(projection.details.commandSections.secondary.B.map((entry) => entry.command.choice)).toEqual([
      'play-from-position',
      'pass-position',
      'ball-in-hand',
    ])
  })

  test('derives valid scoreboard projection from machine state', () => {
    const runtime = new StrilaGameplayRuntime()
    let state = runtime.createInitialState({ targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    state = apply(runtime, state, { type: 'frame.commence', seat: 'A' })
    state = apply(runtime, state, { type: 'pot.record', seat: 'A', pottedBalls: [1] })

    const projection = v.parse(StrilaScoreboardViewSchema, runtime.deriveProjection({ state, projection: 'scoreboard' }))

    expect(projection.details.phase).toBe('open-play')
    expect(projection.details.ballsRemaining).toEqual([2, 3, 4, 5, 6, 7])
    expect(projection.details.pointsAvailable).toBe(12)
  })

  test('derives valid summary projection from machine state', () => {
    const runtime = new StrilaGameplayRuntime()
    const state = runtime.createInitialState({ targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })

    const projection = v.parse(StrilaSummaryViewSchema, runtime.deriveProjection({ state, projection: 'summary' }))

    expect(projection.details.phase).toBe('not-started')
  })
})

describe('StrilaGameplayRuntime outcomes', () => {
  test('respotted black records Strila determination reason but emits target-reached frame outcome', () => {
    const runtime = new StrilaGameplayRuntime()
    let state = runtime.createInitialState({ targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    state = {
      ...state,
      score: { A: 8, B: 8 },
      coloredBallsOnTable: [7],
      phase: 'respotted-black.opening',
    }

    state = apply(runtime, state, { type: 'pot.record', seat: 'A', pottedBalls: [7] })
    expect(state.winnerDeterminationReason).toBe('respotted-black-won')

    const result = runtime.applyCommand({ state, commandType: 'frame.award', command: { seat: 'A' } })

    expect(result.outcome).toEqual({ winnerSeat: 'A', score: { A: 10, B: 8 }, winReason: 'target-reached' })
  })
})

import { describe, expect, test } from 'bun:test'

import { StrilaControlViewSchema, StrilaScoreboardViewSchema, StrilaSummaryViewSchema } from './definitions'
import { StrilaGameplayRuntime, type StrilaFrameState } from './runtime'

function apply(
  runtime: StrilaGameplayRuntime,
  state: StrilaFrameState,
  command: { type: string; [key: string]: unknown },
): StrilaFrameState {
  return runtime.applyCommand({ state, commandType: command.type, command }).state as StrilaFrameState
}

describe('StrilaGameplayRuntime projections', () => {
  test('derives valid control projection from machine state', () => {
    const runtime = new StrilaGameplayRuntime()
    let state = runtime.createInitialState({ targetPointsBySeat: { A: 9, B: 9 } })
    state = apply(runtime, state, { type: 'frame.commence', actor: 'A' })
    state = apply(runtime, state, { type: 'foul.commit', actor: 'A' })

    const projection = StrilaControlViewSchema.parse(runtime.deriveProjection({ state, projection: 'control' }))

    expect(projection.details.phase).toBe('foul-committed.penalty-selection')
    expect(projection.details.actor).toBe('B')
    expect(projection.details.commandSections.secondary.B.map((entry) => entry.command.choice)).toEqual([
      'play-from-position',
      'pass-position',
      'ball-in-hand',
    ])
  })

  test('derives valid scoreboard projection from machine state', () => {
    const runtime = new StrilaGameplayRuntime()
    let state = runtime.createInitialState({ targetPointsBySeat: { A: 9, B: 9 } })
    state = apply(runtime, state, { type: 'frame.commence', actor: 'A' })
    state = apply(runtime, state, { type: 'pot.record', actor: 'A', pottedBalls: [1] })

    const projection = StrilaScoreboardViewSchema.parse(runtime.deriveProjection({ state, projection: 'scoreboard' }))

    expect(projection.details.phase).toBe('open-play')
    expect(projection.details.ballsRemaining).toEqual([2, 3, 4, 5, 6, 7])
    expect(projection.details.pointsAvailable).toBe(12)
  })

  test('derives valid summary projection from machine state', () => {
    const runtime = new StrilaGameplayRuntime()
    const state = runtime.createInitialState({ targetPointsBySeat: { A: 9, B: 9 } })

    const projection = StrilaSummaryViewSchema.parse(runtime.deriveProjection({ state, projection: 'summary' }))

    expect(projection.details.phase).toBe('not-started')
  })
})

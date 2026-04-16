import { describe, expect, test } from 'bun:test'

import { type StrilaFrameState } from './definitions'
import { createEmptyStrilaFrameState, reduceStrilaCommand } from './reducer'

const DEFAULT_TARGETS = { A: 9, B: 9 } as const

describe('reducer: basic', () => {
  test('frame.commence enters open-play for actor', () => {
    const next = reduceStrilaCommand(createEmptyStrilaFrameState(), { type: 'frame.commence', actor: 'A' })

    expect(next.phase).toEqual({
      type: 'open-play',
      actor: 'A',
      cueBallPotsInRun: 0,
    })
    expect(next.score).toEqual({ A: 0, B: 0 })
    expect(next.coloredBallsOnTable).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  test('target reached becomes winner-determined until frame.award', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 0 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [6, 7],
      phase: {
        type: 'open-play',
        actor: 'A',
        cueBallPotsInRun: 0,
      },
    }

    const afterPot = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'A',
      pottedBalls: [6],
    })

    expect(afterPot.score).toEqual({ A: 10, B: 0 })
    expect(afterPot.coloredBallsOnTable).toEqual([7])
    expect(afterPot.phase).toEqual({
      type: 'winner-determined',
      winner: 'A',
      actor: 'A',
      reason: 'target-reached',
    })
  })

  test('frame.award closes a winner-determined frame', () => {
    const state: StrilaFrameState = {
      score: { A: 10, B: 0 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: {
        type: 'winner-determined',
        winner: 'A',
        actor: 'A',
        reason: 'target-reached',
      },
    }

    const afterAward = reduceStrilaCommand(state, {
      type: 'frame.award',
      actor: 'A',
    })

    expect(afterAward.phase).toEqual({
      type: 'frame-over',
      winner: 'A',
    })
  })
})

describe('reducer: foul handling', () => {
  test('foul then ball-in-hand then miss returns to opponent open-play', () => {
    let state = reduceStrilaCommand(createEmptyStrilaFrameState(), { type: 'frame.commence', actor: 'A' })
    state = reduceStrilaCommand(state, { type: 'foul.commit', actor: 'A' })
    expect(state.phase).toEqual({
      type: 'penalty-selection',
      chooser: 'B',
      offender: 'A',
      forcedBallInHand: false,
    })

    state = reduceStrilaCommand(state, {
      type: 'penalty.select',
      actor: 'B',
      choice: 'ball-in-hand',
    })
    expect(state.phase).toEqual({
      type: 'ball-in-hand',
      actor: 'B',
    })

    state = reduceStrilaCommand(state, { type: 'miss.record', actor: 'B' })
    expect(state.phase).toEqual({
      type: 'open-play',
      actor: 'A',
      cueBallPotsInRun: 0,
    })
  })

  test('foul response play-from-position awards one point to chooser and keeps actor', () => {
    let state = reduceStrilaCommand(createEmptyStrilaFrameState(), { type: 'frame.commence', actor: 'A' })
    state = reduceStrilaCommand(state, { type: 'foul.commit', actor: 'A' })
    state = reduceStrilaCommand(state, {
      type: 'penalty.select',
      actor: 'B',
      choice: 'play-from-position',
    })

    expect(state.score).toEqual({ A: 0, B: 1 })
    expect(state.phase).toEqual({
      type: 'open-play',
      actor: 'B',
      cueBallPotsInRun: 0,
    })
  })

  test('foul response pass-position awards one point to chooser and returns actor to offender', () => {
    let state = reduceStrilaCommand(createEmptyStrilaFrameState(), { type: 'frame.commence', actor: 'A' })
    state = reduceStrilaCommand(state, { type: 'foul.commit', actor: 'A' })
    state = reduceStrilaCommand(state, {
      type: 'penalty.select',
      actor: 'B',
      choice: 'pass-position',
    })

    expect(state.score).toEqual({ A: 0, B: 1 })
    expect(state.phase).toEqual({
      type: 'open-play',
      actor: 'A',
      cueBallPotsInRun: 0,
    })
  })

  test('opponent-foul ball-in-hand cue ball and colored ball together becomes a foul', () => {
    const started = reduceStrilaCommand(createEmptyStrilaFrameState(), { type: 'frame.commence', actor: 'A' })
    const foulResponse = reduceStrilaCommand(started, { type: 'foul.commit', actor: 'A' })
    const state = reduceStrilaCommand(foulResponse, {
      type: 'penalty.select',
      actor: 'B',
      choice: 'ball-in-hand',
    })

    const next = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'B',
      pottedBalls: [0, 3],
    })

    expect(next.score).toEqual({ A: 0, B: 0 })
    expect(next.coloredBallsOnTable).toEqual(state.coloredBallsOnTable)
    expect(next.phase).toEqual({
      type: 'penalty-selection',
      chooser: 'A',
      offender: 'B',
      forcedBallInHand: false,
    })
  })

  test('third consecutive cue ball pot becomes an automatic foul', () => {
    const state: StrilaFrameState = {
      score: { A: 2, B: 0 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [5, 7],
      phase: {
        type: 'open-play',
        actor: 'A',
        cueBallPotsInRun: 2,
      },
    }

    const next = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'A',
      pottedBalls: [0],
    })

    expect(next.score).toEqual({ A: 2, B: 0 })
    expect(next.coloredBallsOnTable).toEqual([5, 7])
    expect(next.phase).toEqual({
      type: 'penalty-selection',
      chooser: 'B',
      offender: 'A',
      forcedBallInHand: false,
    })
  })
})

describe('reducer: respotted black', () => {
  test('entering the phase after potting the last black', () => {
    const state: StrilaFrameState = {
      score: { A: 6, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'open-play', actor: 'A', cueBallPotsInRun: 0 },
    }

    const next = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'A',
      pottedBalls: [7],
    })

    expect(next.score).toEqual({ A: 8, B: 8 })
    expect(next.coloredBallsOnTable).toEqual([7])
    expect(next.phase).toEqual({ type: 'respotted-black-opening', actor: 'A' })
  })

  test('not entering the phase when balls remaining', () => {
    const state: StrilaFrameState = {
      score: { A: 6, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [5, 6, 7],
      phase: { type: 'open-play', actor: 'A', cueBallPotsInRun: 0 },
    }

    const next = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'A',
      pottedBalls: [6],
    })

    expect(next.score).toEqual({ A: 8, B: 8 })
    expect(next.coloredBallsOnTable).toEqual([5, 7])
    expect(next.phase).toEqual({
      type: 'open-play',
      actor: 'A',
      cueBallPotsInRun: 0,
    })
  })

  test('opening black pot determines winner', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-opening', actor: 'A' },
    }

    const next = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'A',
      pottedBalls: [7],
    })

    expect(next.score).toEqual({ A: 10, B: 8 })
    expect(next.coloredBallsOnTable).toEqual([])
    expect(next.phase).toEqual({
      type: 'winner-determined',
      winner: 'A',
      actor: 'A',
      reason: 'respotted-black-won',
    })
  })

  test('opening cue ball pot determines opponent winner', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-opening', actor: 'A' },
    }

    const next = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'A',
      pottedBalls: [0],
    })

    expect(next.score).toEqual({ A: 8, B: 8 })
    expect(next.coloredBallsOnTable).toEqual([7])
    expect(next.phase).toEqual({
      type: 'winner-determined',
      winner: 'B',
      actor: 'B',
      reason: 'automatic-foul',
    })
  })

  test('opening cue ball plus black pot still determines opponent winner', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-opening', actor: 'A' },
    }

    const next = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'A',
      pottedBalls: [0, 7],
    })

    expect(next.score).toEqual({ A: 8, B: 8 })
    expect(next.coloredBallsOnTable).toEqual([7])
    expect(next.phase).toEqual({
      type: 'winner-determined',
      winner: 'B',
      actor: 'B',
      reason: 'automatic-foul',
    })
  })

  test('play cue ball pot determines winner', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-play', actor: 'A' },
    }

    const next = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'A',
      pottedBalls: [0],
    })

    expect(next.score).toEqual({ A: 9, B: 8 })
    expect(next.coloredBallsOnTable).toEqual([])
    expect(next.phase).toEqual({
      type: 'winner-determined',
      winner: 'A',
      actor: 'A',
      reason: 'respotted-black-won',
    })
  })

  test('play black pot determines winner', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-play', actor: 'B' },
    }

    const next = reduceStrilaCommand(state, {
      type: 'pot.record',
      actor: 'B',
      pottedBalls: [7],
    })

    expect(next.score).toEqual({ A: 8, B: 10 })
    expect(next.coloredBallsOnTable).toEqual([])
    expect(next.phase).toEqual({
      type: 'winner-determined',
      winner: 'B',
      actor: 'B',
      reason: 'respotted-black-won',
    })
  })

  test('foul determines winner', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [],
      phase: { type: 'respotted-black-play', actor: 'A' },
    }

    const next = reduceStrilaCommand(state, {
      type: 'foul.commit',
      actor: 'A',
    })

    expect(next.phase).toEqual({
      type: 'winner-determined',
      winner: 'B',
      actor: 'B',
      reason: 'automatic-foul',
    })
  })

  test('opening miss enters respotted-black-play for opponent', () => {
    const state: StrilaFrameState = {
      score: { A: 8, B: 8 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-opening', actor: 'A' },
    }

    const next = reduceStrilaCommand(state, {
      type: 'miss.record',
      actor: 'A',
    })

    expect(next.phase).toEqual({
      type: 'respotted-black-play',
      actor: 'B',
    })
  })

  test('pot.record rejects colored ball not on table', () => {
    const state: StrilaFrameState = {
      score: { A: 0, B: 0 },
      targetPointsBySeat: DEFAULT_TARGETS,
      coloredBallsOnTable: [2, 3, 4, 5, 6, 7],
      phase: { type: 'open-play', actor: 'A', cueBallPotsInRun: 0 },
    }

    expect(() =>
      reduceStrilaCommand(state, {
        type: 'pot.record',
        actor: 'A',
        pottedBalls: [1],
      }),
    ).toThrow('Potted ball 1 is not on the table')
  })

  test('handicap target lets A win at 6 after three pots', () => {
    let state = reduceStrilaCommand(createEmptyStrilaFrameState({ A: 6, B: 9 }), { type: 'frame.commence', actor: 'A' })
    state = reduceStrilaCommand(state, { type: 'pot.record', actor: 'A', pottedBalls: [1] })
    state = reduceStrilaCommand(state, { type: 'pot.record', actor: 'A', pottedBalls: [2] })
    state = reduceStrilaCommand(state, { type: 'pot.record', actor: 'A', pottedBalls: [3] })

    expect(state.score).toEqual({ A: 6, B: 0 })
    expect(state.phase).toEqual({
      type: 'winner-determined',
      winner: 'A',
      actor: 'A',
      reason: 'target-reached',
    })
  })
})

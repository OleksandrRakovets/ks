import { describe, expect, test } from 'bun:test'

import { FrameOutcome } from '@ks/core'
import * as v from 'valibot'

import { GameProtocolEntry } from './gameplay-session'
import { LongFreePyramidCheckpoint, LongFreePyramidGamePresentation } from './long-free-pyramid/definitions'
import { restoreLongFreePyramidGameplaySession } from './long-free-pyramid/session'
import {
  CombinedPyramidGamePresentation,
  CombinedPyramidOldGamePresentation,
  FreePyramidGamePresentation,
  PyramidCheckpoint,
} from './pyramid/definitions'
import { restorePyramidGameplaySession } from './pyramid/session'
import { createGameplaySession } from './session-factory'
import { StrilaCheckpoint, type StrilaCommand, StrilaGamePresentation } from './strila-v2/definitions'
import { restoreStrilaGameplaySession } from './strila-v2/session'

const scenarios = [
  {
    gameKey: 'strila-v2',
    create: () => createGameplaySession('strila-v2', { targetPointsBySeat: { A: 1, B: 1 } }),
    presentationSchema: StrilaGamePresentation,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBalls: [0] }),
  },
  {
    gameKey: 'free-pyramid',
    create: () => createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 1, B: 1 } }),
    presentationSchema: FreePyramidGamePresentation,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBallCount: 1 }),
  },
  {
    gameKey: 'free-pyramid-long',
    create: () =>
      createGameplaySession('free-pyramid-long', { targetPointsBySeat: { A: 1, B: 1 }, rackRollover: 14 }),
    presentationSchema: LongFreePyramidGamePresentation,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBallCount: 1 as const }),
  },
  {
    gameKey: 'combined-pyramid',
    create: () => createGameplaySession('combined-pyramid', { targetPointsBySeat: { A: 1, B: 1 } }),
    presentationSchema: CombinedPyramidGamePresentation,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBallCount: 1 }),
  },
  {
    gameKey: 'combined-pyramid-old',
    create: () => createGameplaySession('combined-pyramid-old', { targetPointsBySeat: { A: 1, B: 1 } }),
    presentationSchema: CombinedPyramidOldGamePresentation,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBallCount: 1 }),
  },
] as const

describe('GameplaySession', () => {
  for (const scenario of scenarios) {
    test(scenario.gameKey, () => {
      const session = scenario.create()
      expect(session.gameKey).toBe(scenario.gameKey)
      expect(session.canCommence('A')).toBe(true)
      expect(session.canConcede()).toBe(true)
      expect(v.is(scenario.presentationSchema, session.deriveControls().game)).toBe(true)

      const initial = session.getScore()
      // SAFETY: deliberately bypass readonly to verify callers cannot mutate resident session state.
      const mutableInitial = initial as { A: number; B: number }
      mutableInitial.A = 99
      expect(session.getScore()).toEqual({ A: 0, B: 0 })

      const commenced = session.execute({ type: 'frame.commence', seat: 'A' })
      expect(commenced._tag).toBe('accepted')
      expect(session.canConcede()).toBe(true)

      if (commenced._tag === 'accepted') {
        expect(commenced.gameProtocolEntries.length).toBeGreaterThan(0)
        expect(commenced.gameProtocolEntries.every((entry) => v.is(GameProtocolEntry, entry))).toBe(true)
      }

      const scoreBeforeRejection = session.getScore()
      const controlsBeforeRejection = session.deriveControls()
      expect(session.execute({ type: 'frame.commence', seat: 'B' })).toEqual({
        _tag: 'rejected',
        reason: { code: 'command-not-available' },
      })
      expect(session.getScore()).toEqual(scoreBeforeRejection)
      expect(session.deriveControls()).toEqual(controlsBeforeRejection)

      // SAFETY: each scenario creates the session and score command for the same literal game key.
      const scored = session.execute(scenario.score() as never)
      expect(scored._tag).toBe('accepted')
      expect(session.canConcede()).toBe(false)
      const frameCompletion = session.execute({ type: 'frame.award', seat: 'A' })
      expect(frameCompletion._tag).toBe('accepted')

      if (frameCompletion._tag === 'accepted') expect(v.is(FrameOutcome, frameCompletion.outcome)).toBe(true)

      expect(session.deriveControls()).not.toBe(session.deriveControls())
      expect(session.getScore()).not.toBe(session.getScore())

      const replay = scenario.create()
      expect(replay.execute({ type: 'frame.commence', seat: 'A' })).toEqual(commenced)
      // SAFETY: each scenario creates the replay session and score command for the same literal game key.
      expect(replay.execute(scenario.score() as never)).toEqual(scored)
      expect(replay.execute({ type: 'frame.award', seat: 'A' })).toEqual(frameCompletion)
      expect(replay.getScore()).toEqual(session.getScore())
      expect(replay.deriveControls()).toEqual(session.deriveControls())
    })
  }

  test('Pyramid restoration requires the selected rules, including ordered shot options', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 9 } })
    expect(session.execute({ type: 'frame.commence', seat: 'B' })._tag).toBe('accepted')
    const checkpoint = v.parse(PyramidCheckpoint, session.exportCheckpoint())
    const restored = restorePyramidGameplaySession('free-pyramid', checkpoint)
    expect(restored.exportCheckpoint()).toEqual(checkpoint)
    expect(restored.execute({ type: 'pot.record', seat: 'B', pottedBallCount: 4 })._tag).toBe('accepted')
    expect(restored.getScore()).toEqual({ A: 0, B: 4 })

    for (const change of [
      { gameKey: 'combined-pyramid' },
      { foulPenalty: 'offender-minus-one' },
      { shotPointOptions: [1, 2] },
      { shotPointOptions: [1, 2, 4, 8] },
      { shotPointOptions: [1, 4, 2] },
    ]) {
      const wrongRules = v.parse(PyramidCheckpoint, {
        ...checkpoint,
        context: { ...checkpoint.context, rules: { ...checkpoint.context.rules, ...change } },
      })

      expect(() => restorePyramidGameplaySession('free-pyramid', wrongRules)).toThrow()
    }
  })

  test('Long Pyramid restoration checks every rack number and both scores, allowing a total of 16', () => {
    const session = createGameplaySession('free-pyramid-long', {
      targetPointsBySeat: { A: 20, B: 21 },
      rackRollover: 14,
    })

    expect(session.execute({ type: 'frame.commence', seat: 'A' })._tag).toBe('accepted')

    const checkpoint = v.parse(LongFreePyramidCheckpoint, {
      ...session.exportCheckpoint(),
      context: {
        ...session.exportCheckpoint().context,
        racks: [
          { rackNumber: 1, scoreBySeat: { A: 5, B: 11 } },
          { rackNumber: 2, scoreBySeat: { A: 2, B: 3 } },
        ],
      },
    })

    const restored = restoreLongFreePyramidGameplaySession(checkpoint)
    expect(restored.exportCheckpoint()).toEqual(checkpoint)
    expect(restored.getScore()).toEqual({ A: 7, B: 14 })
    expect(restored.execute({ type: 'foul.commit', seat: 'A' })._tag).toBe('accepted')
    expect(restored.getScore()).toEqual({ A: 7, B: 15 })

    for (const rack of [
      { rackNumber: 3, scoreBySeat: { A: 2, B: 3 } },
      { rackNumber: 2, scoreBySeat: { A: -1, B: 3 } },
      { rackNumber: 2, scoreBySeat: { A: 2, B: -1 } },
      { rackNumber: 2, scoreBySeat: { A: 12, B: 5 } },
    ]) {
      const wrongRack = v.parse(LongFreePyramidCheckpoint, {
        ...checkpoint,
        context: { ...checkpoint.context, racks: [checkpoint.context.racks[0], rack] },
      })

      expect(() => restoreLongFreePyramidGameplaySession(wrongRack)).toThrow()
    }
  })

  test('Strila restoration requires an offender only while selecting a foul penalty', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: { A: 9, B: 9 } })
    expect(session.execute({ type: 'frame.commence', seat: 'A' })._tag).toBe('accepted')
    expect(session.execute({ type: 'foul.commit', seat: 'B' })._tag).toBe('accepted')
    const checkpoint = session.exportCheckpoint()

    const missingOffender = v.parse(StrilaCheckpoint, {
      ...checkpoint,
      context: { ...checkpoint.context, foulOffender: null },
    })

    expect(checkpoint.value).toEqual({ 'foul-committed': 'penalty-selection' })
    expect(() => restoreStrilaGameplaySession(missingOffender)).toThrow(
      'Penalty selection requires foul offender',
    )

    const selecting = restoreStrilaGameplaySession(v.parse(StrilaCheckpoint, checkpoint))
    expect(selecting.exportCheckpoint()).toEqual(checkpoint)
    expect(selecting.execute({ type: 'penalty.select', seat: 'A', choice: 'ball-in-hand' })._tag).toBe(
      'accepted',
    )
    const ballInHand = v.parse(StrilaCheckpoint, selecting.exportCheckpoint())
    expect(ballInHand).toMatchObject({
      value: { 'foul-committed': 'ball-in-hand' },
      context: { foulOffender: null },
    })

    const restored = restoreStrilaGameplaySession(ballInHand)
    expect(restored.exportCheckpoint()).toEqual(ballInHand)
    expect(restored.execute({ type: 'pot.record', seat: 'A', pottedBalls: [1] })._tag).toBe('accepted')
    expect(restored.exportCheckpoint()).toMatchObject({
      value: 'open-play',
      context: { score: { A: 2, B: 0 }, pottedBallsBySeat: { A: [1], B: [] }, foulOffender: null },
    })
  })

  test('Strila restoration preserves every respotted-black phase and requires exactly ball 7', () => {
    let session = createGameplaySession('strila-v2', { targetPointsBySeat: { A: 9, B: 9 } })

    for (const command of [
      { type: 'frame.commence', seat: 'A' },
      { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3] },
      { type: 'pot.record', seat: 'B', pottedBalls: [0, 4, 5, 6] },
      { type: 'pot.record', seat: 'B', pottedBalls: [0] },
      { type: 'pot.record', seat: 'A', pottedBalls: [7] },
    ] satisfies StrilaCommand[])
      expect(session.execute(command)._tag).toBe('accepted')

    expect(session.exportCheckpoint()).toMatchObject({
      value: { 'respotted-black': 'opening-selection' },
      context: { score: { A: 8, B: 8 }, coloredBallsOnTable: [7] },
    })

    for (const continuation of [
      {
        command: { type: 'respotted-black.opening.select', seat: 'B' },
        value: { 'respotted-black': 'opening' },
      },
      { command: { type: 'miss.record', seat: 'B' }, value: { 'respotted-black': 'play' } },
      { command: { type: 'foul.commit', seat: 'A' }, value: 'winner-determined' },
    ] satisfies { command: StrilaCommand; value: StrilaCheckpoint['value'] }[]) {
      const checkpoint = v.parse(StrilaCheckpoint, session.exportCheckpoint())

      for (const coloredBallsOnTable of [[6], [7, 7]]) {
        const wrongTable = v.parse(StrilaCheckpoint, {
          ...checkpoint,
          context: { ...checkpoint.context, coloredBallsOnTable },
        })

        expect(() => restoreStrilaGameplaySession(wrongTable)).toThrow(
          'Respotted black requires only black ball',
        )
      }

      const restored = restoreStrilaGameplaySession(checkpoint)
      expect(restored.exportCheckpoint()).toEqual(checkpoint)
      expect(restored.execute(continuation.command)._tag).toBe('accepted')
      expect(restored.exportCheckpoint().value).toEqual(continuation.value)
      session = restored
    }

    expect(session.exportCheckpoint()).toMatchObject({
      value: 'winner-determined',
      context: { score: { A: 8, B: 8 }, winner: 'B', winnerDeterminationReason: 'automatic-foul' },
    })
  })
})

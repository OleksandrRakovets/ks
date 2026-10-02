import { describe, expect, test } from 'bun:test'

import { FrameOutcome } from '@ks/core'
import { Schema } from 'effect'

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
import { GameplayCheckpoint } from './registry'
import { createGameplaySession, restoreGameplaySession } from './session-factory'
import { StrilaCheckpoint, type StrilaCommand, StrilaGamePresentation } from './strila-v2/definitions'
import { restoreStrilaGameplaySession } from './strila-v2/session'

type StrilaCommand = typeof StrilaCommand.Type

type StrilaCheckpoint = typeof StrilaCheckpoint.Type

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
      expect(Schema.is(scenario.presentationSchema)(session.deriveControls().game)).toBe(true)

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
        expect(commenced.gameProtocolEntries.every(Schema.is(GameProtocolEntry))).toBe(true)
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

      if (frameCompletion._tag === 'accepted')
        expect(Schema.is(FrameOutcome)(frameCompletion.outcome)).toBe(true)

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

    test(`${scenario.gameKey} preserves persisted JSON and local object policies`, () => {
      const session = scenario.create()
      const checkpoint = { gameKey: scenario.gameKey, state: session.exportCheckpoint() }
      const stored = JSON.stringify(checkpoint)
      const restored = restoreGameplaySession(Schema.decodeUnknownSync(GameplayCheckpoint)(JSON.parse(stored)))
      expect(JSON.stringify({ gameKey: restored.gameKey, state: restored.exportCheckpoint() })).toBe(stored)

      expect(
        JSON.stringify(
          Schema.decodeUnknownSync(GameplayCheckpoint)({
            ...checkpoint,
            extra: true,
            state: { ...checkpoint.state, extra: true, context: { ...checkpoint.state.context, extra: true } },
          }),
        ),
      ).toBe(stored)

      const presentation = session.deriveControls().game
      expect(
        JSON.stringify(
          Schema.decodeUnknownSync(scenario.presentationSchema)({
            ...presentation,
            extra: true,
            details: { ...presentation.details, extra: true },
          }),
        ),
      ).toBe(JSON.stringify(presentation))

      const commenced = session.execute({ type: 'frame.commence', seat: 'A' })
      expect(commenced._tag).toBe('accepted')

      if (commenced._tag === 'accepted') {
        const entry = commenced.gameProtocolEntries[0]

        const presentUndefined = Schema.decodeUnknownSync(GameProtocolEntry)({
          ...entry,
          scoreAfter: undefined,
        })

        expect(Object.hasOwn(presentUndefined, 'scoreAfter')).toBe(true)
        expect(presentUndefined.scoreAfter).toBeUndefined()
        const omitted = Schema.decodeUnknownSync(GameProtocolEntry)(JSON.parse(JSON.stringify(entry)))
        expect(Object.hasOwn(omitted, 'scoreAfter')).toBe(false)
        expect(
          Schema.decodeUnknownSync(GameProtocolEntry)({
            ...entry,
            extra: true,
            scoreAfter: { A: 2, B: 5, extra: true },
          }),
        ).toEqual({ ...entry, scoreAfter: { A: 2, B: 5 } })
        expect(() =>
          Schema.decodeUnknownSync(GameProtocolEntry)({
            ...entry,
            body: { ...entry.body, extra: true },
          }),
        ).toThrow()
      }
    })
  }

  test('Strila compound snapshot values reject excess keys without tightening context', () => {
    const context = createGameplaySession('strila-v2', {
      targetPointsBySeat: { A: 9, B: 9 },
    }).exportCheckpoint().context

    for (const value of [
      { 'foul-committed': 'penalty-selection' },
      { 'respotted-black': 'opening-selection' },
    ] as const) {
      expect(
        Schema.decodeUnknownSync(StrilaCheckpoint)({ value, context: { ...context, extra: true } }),
      ).toEqual({ value, context })
      expect(() =>
        Schema.decodeUnknownSync(StrilaCheckpoint)({ value: { ...value, extra: true }, context }),
      ).toThrow()
    }
  })

  test('Pyramid restoration requires the selected rules, including ordered shot options', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 9 } })
    expect(session.execute({ type: 'frame.commence', seat: 'B' })._tag).toBe('accepted')
    const checkpoint = Schema.decodeUnknownSync(PyramidCheckpoint)(session.exportCheckpoint())
    const restored = restorePyramidGameplaySession('free-pyramid', checkpoint)
    expect(restored.exportCheckpoint()).toEqual(checkpoint)
    expect(restored.execute({ type: 'pot.record', seat: 'B', pottedBallCount: 4 })._tag).toBe('accepted')
    expect(restored.getScore()).toEqual({ A: 0, B: 4 })

    for (const change of [
      { gameKey: 'combined-pyramid' },
      { allowNegative: true },
      { foulPenalty: 'offender-minus-one' },
      { shotPointOptions: [1, 2] },
      { shotPointOptions: [1, 2, 4, 8] },
      { shotPointOptions: [1, 4, 2] },
    ]) {
      const wrongRules = Schema.decodeUnknownSync(PyramidCheckpoint)({
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

    const checkpoint = Schema.decodeUnknownSync(LongFreePyramidCheckpoint)({
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
      const wrongRack = Schema.decodeUnknownSync(LongFreePyramidCheckpoint)({
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

    const missingOffender = Schema.decodeUnknownSync(StrilaCheckpoint)({
      ...checkpoint,
      context: { ...checkpoint.context, foulOffender: null },
    })

    expect(checkpoint.value).toEqual({ 'foul-committed': 'penalty-selection' })
    expect(() => restoreStrilaGameplaySession(missingOffender)).toThrow(
      'Penalty selection requires foul offender',
    )

    const selecting = restoreStrilaGameplaySession(Schema.decodeUnknownSync(StrilaCheckpoint)(checkpoint))
    expect(selecting.exportCheckpoint()).toEqual(checkpoint)
    expect(selecting.execute({ type: 'penalty.select', seat: 'A', choice: 'ball-in-hand' })._tag).toBe(
      'accepted',
    )
    const ballInHand = Schema.decodeUnknownSync(StrilaCheckpoint)(selecting.exportCheckpoint())
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
      const checkpoint = Schema.decodeUnknownSync(StrilaCheckpoint)(session.exportCheckpoint())

      for (const coloredBallsOnTable of [[6], [7, 7]]) {
        const wrongTable = Schema.decodeUnknownSync(StrilaCheckpoint)({
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

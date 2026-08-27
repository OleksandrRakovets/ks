import { describe, expect, test } from 'bun:test'

import { FrameOutcome, GameProtocolEntry } from '@ks/core'
import * as v from 'valibot'

import { LongFreePyramidControlViewSchema } from './long-free-pyramid/definitions'
import {
  CombinedPyramidControlViewSchema,
  CombinedPyramidOldControlViewSchema,
  FreePyramidControlViewSchema,
} from './pyramid/definitions'
import { createGameplaySession } from './session-factory'
import { StrilaControlViewSchema } from './strila-v2/definitions'

const scenarios = [
  {
    gameKey: 'strila-v2',
    create: () => createGameplaySession('strila-v2', { targetPointsBySeat: { A: 1, B: 1 } }),
    controlSchema: StrilaControlViewSchema,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBalls: [0] }),
  },
  {
    gameKey: 'free-pyramid',
    create: () => createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 1, B: 1 } }),
    controlSchema: FreePyramidControlViewSchema,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBallCount: 1 }),
  },
  {
    gameKey: 'free-pyramid-long',
    create: () =>
      createGameplaySession('free-pyramid-long', { targetPointsBySeat: { A: 1, B: 1 }, rackRollover: 14 }),
    controlSchema: LongFreePyramidControlViewSchema,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBallCount: 1 as const }),
  },
  {
    gameKey: 'combined-pyramid',
    create: () => createGameplaySession('combined-pyramid', { targetPointsBySeat: { A: 1, B: 1 } }),
    controlSchema: CombinedPyramidControlViewSchema,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBallCount: 1 }),
  },
  {
    gameKey: 'combined-pyramid-old',
    create: () => createGameplaySession('combined-pyramid-old', { targetPointsBySeat: { A: 1, B: 1 } }),
    controlSchema: CombinedPyramidOldControlViewSchema,
    score: () => ({ type: 'pot.record' as const, seat: 'A' as const, pottedBallCount: 1 }),
  },
] as const

describe('GameplaySession', () => {
  for (const scenario of scenarios) {
    test(scenario.gameKey, () => {
      const session = scenario.create()
      expect(session.gameKey).toBe(scenario.gameKey)
      expect(session.canCommence('A')).toBe(true)
      expect(v.is(scenario.controlSchema, session.deriveControl())).toBe(true)

      const initial = session.getScore()
      initial.A = 99
      expect(session.getScore()).toEqual({ A: 0, B: 0 })

      const commenced = session.execute({ type: 'frame.commence', seat: 'A' })
      expect(commenced._tag).toBe('accepted')
      if (commenced._tag === 'accepted') {
        expect(commenced.gameProtocolEntries.length).toBeGreaterThan(0)
        expect(commenced.gameProtocolEntries.every((entry) => v.is(GameProtocolEntry, entry))).toBe(true)
      }

      const scoreBeforeRejection = session.getScore()
      const controlBeforeRejection = session.deriveControl()
      expect(session.execute({ type: 'frame.commence', seat: 'B' })).toEqual({
        _tag: 'rejected',
        reason: { code: 'command-not-available' },
      })
      expect(session.getScore()).toEqual(scoreBeforeRejection)
      expect(session.deriveControl()).toEqual(controlBeforeRejection)

      // SAFETY: each scenario creates the session and score command for the same literal game key.
      const scored = session.execute(scenario.score() as never)
      expect(scored._tag).toBe('accepted')
      const terminal = session.execute({ type: 'frame.award', seat: 'A' })
      expect(terminal._tag).toBe('accepted')
      if (terminal._tag === 'accepted') expect(v.is(FrameOutcome, terminal.outcome)).toBe(true)

      expect(session.deriveControl()).not.toBe(session.deriveControl())
      expect(session.getScore()).not.toBe(session.getScore())

      const replay = scenario.create()
      expect(replay.execute({ type: 'frame.commence', seat: 'A' })).toEqual(commenced)
      // SAFETY: each scenario creates the replay session and score command for the same literal game key.
      expect(replay.execute(scenario.score() as never)).toEqual(scored)
      expect(replay.execute({ type: 'frame.award', seat: 'A' })).toEqual(terminal)
      expect(replay.getScore()).toEqual(session.getScore())
      expect(replay.deriveControl()).toEqual(session.deriveControl())
    })
  }
})

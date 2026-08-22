import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { InvalidPreparedTransitionError } from '../gameplay-session'
import { applyWarmCommand, defineGameplaySessionContractSuite } from '../gameplay-session.contract.test'
import { createGameplaySession } from '../session-factory'
import {
  CombinedPyramidControlViewSchema,
  CombinedPyramidOldControlViewSchema,
  CombinedPyramidOldScoreboardViewSchema,
  CombinedPyramidOldSummaryViewSchema,
  CombinedPyramidScoreboardViewSchema,
  CombinedPyramidSummaryViewSchema,
  FreePyramidControlViewSchema,
  FreePyramidScoreboardViewSchema,
  FreePyramidSummaryViewSchema,
  type PyramidCommand,
  PyramidFrameStateSchema,
} from './definitions'
import { type PyramidGameKey, PyramidRuleSpecificsByGameKey } from './rules'
import { createPyramidGameplaySession } from './session'

const pyramidContractArgs = {
  createArgs: { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' as const },
  stateSchema: PyramidFrameStateSchema,
  validCommand: { type: 'frame.commence', seat: 'A' } as const,
  unavailableCommand: { type: 'pot.record', seat: 'A', points: 99 } as const,
  replayCommands: [
    { type: 'frame.commence', seat: 'A' } as const,
    { type: 'pot.record', seat: 'A', points: 1 } as const,
    { type: 'foul.commit', seat: 'B' } as const,
  ],
  sameRevisionSetupCommands: [{ type: 'frame.commence', seat: 'A' } as const],
  sameRevisionCommand: { type: 'pot.record', seat: 'A', points: 1 } as const,
}

defineGameplaySessionContractSuite({
  gameKey: 'free-pyramid',
  ...pyramidContractArgs,
  projectionSchemas: {
    control: FreePyramidControlViewSchema,
    scoreboard: FreePyramidScoreboardViewSchema,
    summary: FreePyramidSummaryViewSchema,
  },
})

defineGameplaySessionContractSuite({
  gameKey: 'combined-pyramid',
  ...pyramidContractArgs,
  projectionSchemas: {
    control: CombinedPyramidControlViewSchema,
    scoreboard: CombinedPyramidScoreboardViewSchema,
    summary: CombinedPyramidSummaryViewSchema,
  },
})

defineGameplaySessionContractSuite({
  gameKey: 'combined-pyramid-old',
  ...pyramidContractArgs,
  projectionSchemas: {
    control: CombinedPyramidOldControlViewSchema,
    scoreboard: CombinedPyramidOldScoreboardViewSchema,
    summary: CombinedPyramidOldSummaryViewSchema,
  },
})

function applyPyramid(session: ReturnType<typeof createPyramidGameplaySession>, command: PyramidCommand) {
  const decision = session.decide(command)
  if (decision._tag !== 'accepted') throw new Error(`Expected accepted command ${command.type}`)
  return session.applyCommitted(decision.transition)
}

function rulesAllowShotPoints(gameKey: PyramidGameKey, points: number): boolean {
  return PyramidRuleSpecificsByGameKey[gameKey].shotPointOptions.some((option) => option === points)
}

describe('PyramidGameplaySession: rules selection', () => {
  test('each game key uses the exhaustive rules map entry', () => {
    for (const gameKey of ['free-pyramid', 'combined-pyramid', 'combined-pyramid-old'] as const) {
      const session = createPyramidGameplaySession(gameKey, { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
      try {
        applyPyramid(session, { type: 'frame.commence', seat: 'A' })
        const plusFour = session.decide({ type: 'pot.record', seat: 'A', points: 4 })
        const allowed = rulesAllowShotPoints(gameKey, 4)
        expect(plusFour._tag).toBe(allowed ? 'accepted' : 'rejected')
      } finally {
        session.dispose()
      }
    }
  })
})

describe('PyramidGameplaySession: scoring scenarios', () => {
  test('asymmetric targets determine the lower-target winner first', () => {
    const session = createPyramidGameplaySession('free-pyramid', { targetPointsBySeat: { A: 3, B: 8 }, breakerSeat: 'A' })
    try {
      applyPyramid(session, { type: 'frame.commence', seat: 'A' })
      applyPyramid(session, { type: 'pot.record', seat: 'A', points: 1 })
      applyPyramid(session, { type: 'pot.record', seat: 'B', points: 4 })
      applyPyramid(session, { type: 'pot.record', seat: 'A', points: 2 })

      expect(session.state.phase).toBe('winner-determined')
      expect(session.state.winner).toBe('A')
      expect(session.state.pointsBySeat).toEqual({ A: 3, B: 4 })
    } finally {
      session.dispose()
    }
  })

  test('free-pyramid accepts +4 and combined variants reject it', () => {
    const free = createPyramidGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
    const combined = createPyramidGameplaySession('combined-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
    try {
      applyPyramid(free, { type: 'frame.commence', seat: 'A' })
      applyPyramid(combined, { type: 'frame.commence', seat: 'A' })
      expect(applyPyramid(free, { type: 'pot.record', seat: 'A', points: 4 }).state.pointsBySeat.A).toBe(4)
      expect(combined.decide({ type: 'pot.record', seat: 'A', points: 4 })._tag).toBe('rejected')
    } finally {
      free.dispose()
      combined.dispose()
    }
  })

  test('non-negative variants reject invalid shot presets instead of clamping', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      expect(session.decide({ type: 'pot.record', seat: 'A', points: -5 })._tag).toBe('rejected')
      expect(session.state.pointsBySeat).toEqual({ A: 0, B: 0 })
    } finally {
      session.dispose()
    }
  })

  test('combined-pyramid-old allows negative score via offender-minus-one foul', () => {
    const session = createGameplaySession('combined-pyramid-old', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'foul.commit', seat: 'A' })
      expect(session.state.pointsBySeat).toEqual({ A: -1, B: 0 })
    } finally {
      session.dispose()
    }
  })

  test('opponent-plus-one foul awards a point to the opponent', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'foul.commit', seat: 'A' })
      expect(session.state.pointsBySeat).toEqual({ A: 0, B: 1 })
    } finally {
      session.dispose()
    }
  })

  test('foul that gives opponent the target fixes that opponent as winner', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 1 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'foul.commit', seat: 'A' })
      expect(session.state.phase).toBe('winner-determined')
      expect(session.state.winner).toBe('B')
    } finally {
      session.dispose()
    }
  })

  test('winner may continue scoring after target is reached', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 2, B: 8 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'pot.record', seat: 'A', points: 2 })
      applyWarmCommand(session, { type: 'pot.record', seat: 'A', points: 1 })
      expect(session.state.pointsBySeat).toEqual({ A: 3, B: 0 })
      expect(session.state.phase).toBe('winner-determined')
    } finally {
      session.dispose()
    }
  })

  test('only the fixed winner may continue pot.record and foul.commit', () => {
    const session = createGameplaySession('free-pyramid', {
      targetPointsBySeat: { A: 2, B: 8 },
      breakerSeat: 'A',
    })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'pot.record', seat: 'A', points: 2 })
      expect(session.decide({ type: 'pot.record', seat: 'B', points: 1 })._tag).toBe('rejected')
      expect(session.decide({ type: 'foul.commit', seat: 'B' })._tag).toBe('rejected')
      expect(session.decide({ type: 'foul.commit', seat: 'A' })._tag).toBe('accepted')
    } finally {
      session.dispose()
    }
  })

  test('wrong-seat frame.award is rejected', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 2, B: 8 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'pot.record', seat: 'A', points: 2 })
      expect(session.decide({ type: 'frame.award', seat: 'B' })._tag).toBe('rejected')
    } finally {
      session.dispose()
    }
  })

  test('frame.award emits schema-valid outcome and projections', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 2, B: 8 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'pot.record', seat: 'A', points: 2 })
      const result = applyWarmCommand(session, { type: 'frame.award', seat: 'A' })

      expect(result.outcome).toEqual({
        winnerSeat: 'A',
        score: { A: 2, B: 0 },
        winReason: 'target-reached',
      })
      expect(v.safeParse(FreePyramidControlViewSchema, session.deriveControl()).success).toBe(true)
      expect(v.safeParse(FreePyramidScoreboardViewSchema, session.deriveScoreboard()).success).toBe(true)
      expect(v.safeParse(FreePyramidSummaryViewSchema, session.deriveSummary()).success).toBe(true)
      expect(v.safeParse(PyramidFrameStateSchema, session.state).success).toBe(true)
    } finally {
      session.dispose()
    }
  })
})

describe('PyramidGameplaySession: phase guards', () => {
  test('rejects frame.commence after open play has started', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      expect(session.decide({ type: 'frame.commence', seat: 'B' })._tag).toBe('rejected')
    } finally {
      session.dispose()
    }
  })

  test('rejects commands after frame-over', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 2, B: 8 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'pot.record', seat: 'A', points: 2 })
      applyWarmCommand(session, { type: 'frame.award', seat: 'A' })
      expect(session.state.phase).toBe('frame-over')
      expect(session.decide({ type: 'pot.record', seat: 'A', points: 1 })._tag).toBe('rejected')
      expect(session.decide({ type: 'foul.commit', seat: 'A' })._tag).toBe('rejected')
      expect(session.decide({ type: 'frame.commence', seat: 'A' })._tag).toBe('rejected')
    } finally {
      session.dispose()
    }
  })
})

describe('PyramidGameplaySession: transition tokens', () => {
  test('stale token throws after revision advances', () => {
    const session = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      const first = session.decide({ type: 'pot.record', seat: 'A', points: 1 })
      const second = session.decide({ type: 'pot.record', seat: 'A', points: 1 })
      if (first._tag !== 'accepted' || second._tag !== 'accepted') throw new Error('expected accepted decisions')
      session.applyCommitted(first.transition)
      expect(() => session.applyCommitted(second.transition)).toThrow(InvalidPreparedTransitionError)
    } finally {
      session.dispose()
    }
  })

  test('foreign token throws on another session', () => {
    const owner = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
    const foreign = createGameplaySession('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })
    try {
      const decision = owner.decide({ type: 'frame.commence', seat: 'A' })
      if (decision._tag !== 'accepted') throw new Error('expected accepted decision')
      expect(() => foreign.applyCommitted(decision.transition)).toThrow(InvalidPreparedTransitionError)
    } finally {
      owner.dispose()
      foreign.dispose()
    }
  })
})

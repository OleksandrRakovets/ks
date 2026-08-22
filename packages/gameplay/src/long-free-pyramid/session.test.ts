import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { InvalidPreparedTransitionError } from '../gameplay-session'
import { applyWarmCommand, defineGameplaySessionContractSuite } from '../gameplay-session.contract.test'
import { createGameplaySession } from '../session-factory'
import {
  type LongFreePyramidCommand,
  LongFreePyramidControlViewSchema,
  LongFreePyramidFrameStateSchema,
  LongFreePyramidScoreboardViewSchema,
  LongFreePyramidSummaryViewSchema,
} from './definitions'
import { createLongFreePyramidGameplaySession } from './session'

const longFreePyramidCreateArgs = {
  targetPointsBySeat: { A: 30, B: 30 },
  breakerSeat: 'A' as const,
  gameConfiguration: { rackRollover: 14 as const },
}

defineGameplaySessionContractSuite({
  gameKey: 'free-pyramid-long',
  createArgs: longFreePyramidCreateArgs,
  stateSchema: LongFreePyramidFrameStateSchema,
  validCommand: { type: 'frame.commence', seat: 'A' } as const,
  unavailableCommand: { type: 'pot.record', seat: 'A', points: 1 } as const,
  replayCommands: [
    { type: 'frame.commence', seat: 'A' } as const,
    { type: 'pot.record', seat: 'A', points: 1 } as const,
    { type: 'foul.commit', seat: 'B' } as const,
  ],
  sameRevisionSetupCommands: [{ type: 'frame.commence', seat: 'A' } as const],
  sameRevisionCommand: { type: 'pot.record', seat: 'A', points: 1 } as const,
  projectionSchemas: {
    control: LongFreePyramidControlViewSchema,
    scoreboard: LongFreePyramidScoreboardViewSchema,
    summary: LongFreePyramidSummaryViewSchema,
  },
})

function applyLongFreePyramid(
  session: ReturnType<typeof createLongFreePyramidGameplaySession>,
  command: LongFreePyramidCommand,
) {
  const decision = session.decide(command)
  if (decision._tag !== 'accepted') throw new Error(`Expected accepted command ${command.type}`)
  return session.applyCommitted(decision.transition)
}

describe('LongFreePyramidGameplaySession: rack rollover configuration', () => {
  test('requires rackRollover 14 or 15 at construction', () => {
    expect(() =>
      createGameplaySession('free-pyramid-long', { targetPointsBySeat: { A: 30, B: 30 }, breakerSeat: 'A' }),
    ).toThrow('Long free pyramid requires rackRollover 14 or 15')
  })

  test('supports both rackRollover values', () => {
    for (const rackRollover of [14, 15] as const) {
      const session = createLongFreePyramidGameplaySession({
        targetPointsBySeat: { A: 30, B: 30 },
        breakerSeat: 'A',
        gameConfiguration: { rackRollover },
      })
      try {
        expect(session.state.rackRollover).toBe(rackRollover)
      } finally {
        session.dispose()
      }
    }
  })
})

describe('LongFreePyramidGameplaySession: scoring scenarios', () => {
  test('tracks racks and rolls over without completing the frame', () => {
    const session = createLongFreePyramidGameplaySession(longFreePyramidCreateArgs)
    try {
      applyLongFreePyramid(session, { type: 'frame.commence', seat: 'A' })
      for (const points of [4, 4, 4, 1] as const) {
        applyLongFreePyramid(session, { type: 'pot.record', seat: 'A', points })
      }
      applyLongFreePyramid(session, { type: 'pot.record', seat: 'B', points: 2 })

      expect(session.state).toEqual({
        racks: [
          { rackNumber: 1, scoreBySeat: { A: 13, B: 2 } },
          { rackNumber: 2, scoreBySeat: { A: 0, B: 0 } },
        ],
        targetPointsBySeat: { A: 30, B: 30 },
        rackRollover: 14,
        phase: 'open-play',
        messages: [{ code: 'rack-started', rackNumber: 2 }],
        winner: null,
      })

      const control = v.parse(LongFreePyramidControlViewSchema, session.deriveControl())
      expect(control.score).toEqual({ A: 13, B: 2 })
      expect(control.details.ballsOnTable).toBe(16)
      expect(control.details.ballsRemoved).toBe(0)
    } finally {
      session.dispose()
    }
  })

  test('winner flow keeps first winner and restricts award', () => {
    const session = createLongFreePyramidGameplaySession({
      targetPointsBySeat: { A: 4, B: 4 },
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: 15 },
    })
    try {
      applyLongFreePyramid(session, { type: 'frame.commence', seat: 'A' })
      applyLongFreePyramid(session, { type: 'pot.record', seat: 'A', points: 4 })
      expect(session.state.phase).toBe('winner-determined')
      expect(session.state.winner).toBe('A')

      const winnerControl = v.parse(LongFreePyramidControlViewSchema, session.deriveControl())
      expect(winnerControl.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual(['frame.award'])
      expect(winnerControl.details.commandSections.primary.B).toEqual([])
      expect(
        winnerControl.details.commandSections.secondary.A.map((entry) => `${entry.commandType}:${entry.command.points}`),
      ).toEqual(['pot.record:1'])
      expect(winnerControl.details.commandSections.secondary.B).toEqual([])

      expect(session.decide({ type: 'pot.record', seat: 'B', points: 1 })._tag).toBe('rejected')

      applyLongFreePyramid(session, { type: 'foul.commit', seat: 'A' })
      expect(session.state.phase).toBe('awaiting-award')
      expect(session.state.winner).toBe('A')

      const result = applyLongFreePyramid(session, { type: 'frame.award', seat: 'A' })
      expect(result.outcome).toEqual({ winnerSeat: 'A', score: { A: 4, B: 1 }, winReason: 'target-reached' })
    } finally {
      session.dispose()
    }
  })

  test('foul reaching target enters awaiting-award', () => {
    const session = createLongFreePyramidGameplaySession({
      targetPointsBySeat: { A: 8, B: 1 },
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: 15 },
    })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'foul.commit', seat: 'A' })
      expect(session.state.phase).toBe('awaiting-award')
      expect(session.state.winner).toBe('B')
    } finally {
      session.dispose()
    }
  })

  test('rejects impossible pot and empty-rack foul', () => {
    const session = createLongFreePyramidGameplaySession(longFreePyramidCreateArgs)
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })

      for (const points of [4, 4, 4, 1] as const) {
        applyWarmCommand(session, { type: 'pot.record', seat: 'A', points })
      }
      expect(session.decide({ type: 'pot.record', seat: 'A', points: 4 })._tag).toBe('rejected')
    } finally {
      session.dispose()
    }

    const emptyRackSession = createLongFreePyramidGameplaySession(longFreePyramidCreateArgs, {
      racks: [{ rackNumber: 1, scoreBySeat: { A: 8, B: 8 } }],
      targetPointsBySeat: { A: 30, B: 30 },
      rackRollover: 14,
      phase: 'open-play',
      messages: [],
      winner: null,
    })
    try {
      expect(emptyRackSession.decide({ type: 'foul.commit', seat: 'A' })._tag).toBe('rejected')
    } finally {
      emptyRackSession.dispose()
    }
  })

  test('frame.award emits schema-valid outcome and projections', () => {
    const session = createLongFreePyramidGameplaySession({
      targetPointsBySeat: { A: 4, B: 4 },
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: 15 },
    })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'pot.record', seat: 'A', points: 4 })
      applyWarmCommand(session, { type: 'frame.award', seat: 'A' })

      expect(v.safeParse(LongFreePyramidControlViewSchema, session.deriveControl()).success).toBe(true)
      expect(v.safeParse(LongFreePyramidScoreboardViewSchema, session.deriveScoreboard()).success).toBe(true)
      expect(v.safeParse(LongFreePyramidSummaryViewSchema, session.deriveSummary()).success).toBe(true)
      expect(v.safeParse(LongFreePyramidFrameStateSchema, session.state).success).toBe(true)
    } finally {
      session.dispose()
    }
  })

  test('wrong-seat frame.award is rejected', () => {
    const session = createLongFreePyramidGameplaySession({
      targetPointsBySeat: { A: 4, B: 4 },
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: 15 },
    })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'pot.record', seat: 'A', points: 4 })
      expect(session.decide({ type: 'frame.award', seat: 'B' })._tag).toBe('rejected')
    } finally {
      session.dispose()
    }
  })

  test('rejects commands after frame-over', () => {
    const session = createLongFreePyramidGameplaySession({
      targetPointsBySeat: { A: 4, B: 4 },
      breakerSeat: 'A',
      gameConfiguration: { rackRollover: 15 },
    })
    try {
      applyWarmCommand(session, { type: 'frame.commence', seat: 'A' })
      applyWarmCommand(session, { type: 'pot.record', seat: 'A', points: 4 })
      applyWarmCommand(session, { type: 'frame.award', seat: 'A' })
      expect(session.state.phase).toBe('frame-over')
      expect(session.decide({ type: 'pot.record', seat: 'A', points: 1 })._tag).toBe('rejected')
    } finally {
      session.dispose()
    }
  })
})

describe('LongFreePyramidGameplaySession: protocol determinism', () => {
  test('warm path protocol entries match replay path', () => {
    const warm = createLongFreePyramidGameplaySession(longFreePyramidCreateArgs)
    const cold = createLongFreePyramidGameplaySession(longFreePyramidCreateArgs)
    try {
      const commands = [
        { type: 'frame.commence', seat: 'A' as const },
        { type: 'pot.record', seat: 'A' as const, points: 4 },
        { type: 'foul.commit', seat: 'B' as const },
      ] as const

      const warmEntries = commands.map((command) => {
        const decision = warm.decide(command)
        if (decision._tag !== 'accepted') throw new Error('expected accepted')
        const result = warm.applyCommitted(decision.transition)
        return result.protocolEntries
      })

      const coldEntries = commands.map((command) => {
        const decision = cold.decide(command)
        if (decision._tag !== 'accepted') throw new Error('expected accepted')
        const result = cold.applyCommitted(decision.transition)
        return result.protocolEntries
      })

      expect(warmEntries).toEqual(coldEntries)
      expect(warm.state).toEqual(cold.state)
    } finally {
      warm.dispose()
      cold.dispose()
    }
  })
})

describe('LongFreePyramidGameplaySession: transition tokens', () => {
  test('stale token throws after revision advances', () => {
    const session = createLongFreePyramidGameplaySession(longFreePyramidCreateArgs)
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
    const owner = createLongFreePyramidGameplaySession(longFreePyramidCreateArgs)
    const foreign = createLongFreePyramidGameplaySession(longFreePyramidCreateArgs)
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

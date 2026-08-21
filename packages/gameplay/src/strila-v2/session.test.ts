import { describe, expect, test } from 'bun:test'

import { InvalidPreparedTransitionError } from '../gameplay-session'
import { createGameplaySession } from '../session-factory'
import { type StrilaCommand, StrilaMeta } from './definitions'
import { createStrilaGameplaySession } from './session'

function apply(session: ReturnType<typeof createGameplaySession<'strila-v2'>>, command: StrilaCommand) {
  const { type: commandType, ...payload } = command
  const decision = session.decide(commandType, payload)
  if (decision._tag !== 'accepted') throw new Error(`Expected accepted command ${command.type}`)
  return session.applyCommitted(decision.transition)
}

describe('StrilaGameplaySession projections', () => {
  test('derives valid control projection from machine state', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    try {
      apply(session, { type: 'frame.commence', seat: 'A' })
      apply(session, { type: 'foul.commit', seat: 'A' })

      const projection = session.deriveControl()

      expect(projection.details.phase).toBe('foul-committed.penalty-selection')
      expect(projection.details.seat).toBe('B')
      expect(projection.details.commandSections.secondary.B.map((entry) => entry.command.choice)).toEqual([
        'play-from-position',
        'pass-position',
        'ball-in-hand',
      ])
    } finally {
      session.dispose()
    }
  })

  test('derives valid scoreboard projection from machine state', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    try {
      apply(session, { type: 'frame.commence', seat: 'A' })
      apply(session, { type: 'pot.record', seat: 'A', pottedBalls: [1] })

      const projection = session.deriveScoreboard()

      expect(projection.details.phase).toBe('open-play')
      expect(projection.details.ballsRemaining).toEqual([2, 3, 4, 5, 6, 7])
      expect(projection.details.pointsAvailable).toBe(12)
    } finally {
      session.dispose()
    }
  })

  test('derives valid summary projection from machine state', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    try {
      expect(session.deriveSummary().details.phase).toBe('not-started')
    } finally {
      session.dispose()
    }
  })
})

describe('StrilaGameplaySession outcomes', () => {
  test('respotted black records Strila determination reason but emits target-reached frame outcome', () => {
    const session = createStrilaGameplaySession(
      { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' },
      {
        score: { A: 8, B: 8 },
        targetPoints: StrilaMeta.defaultTargetPoints,
        coloredBallsOnTable: [7],
        cueBallSerialPots: null,
        foulOffender: null,
        winner: null,
        winnerDeterminationReason: null,
        phase: 'respotted-black.opening',
      },
    )
    try {
      apply(session, { type: 'pot.record', seat: 'A', pottedBalls: [7] })
      expect(session.state.winnerDeterminationReason).toBe('respotted-black-won')

      const award = session.decide('frame.award', { seat: 'A' })
      if (award._tag !== 'accepted') throw new Error('expected award acceptance')
      expect(award.result.outcome).toEqual({ winnerSeat: 'A', score: { A: 10, B: 8 }, winReason: 'target-reached' })
    } finally {
      session.dispose()
    }
  })
})

describe('StrilaGameplaySession protocol and lifecycle', () => {
  test('protocol entries are deterministic', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    try {
      apply(session, { type: 'frame.commence', seat: 'A' })
      apply(session, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4] })
      const decision = session.decide('pot.record', { seat: 'A', pottedBalls: [5] })
      if (decision._tag !== 'accepted') throw new Error('expected accepted winning pot')
      expect(decision.result.protocolEntries).toEqual([
        {
          source: 'player',
          entryType: 'player-command',
          seat: 'A',
          scoreAfter: { A: 10, B: 0 },
          body: { commandType: 'pot.record', pottedBalls: [5] },
        },
        {
          source: 'system',
          entryType: 'system-note',
          seat: 'A',
          body: { systemType: 'winner-determined', reason: 'target-reached' },
        },
      ])
    } finally {
      session.dispose()
    }
  })

  test('frame.award returns a valid outcome', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    try {
      apply(session, { type: 'frame.commence', seat: 'A' })
      apply(session, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4, 5] })
      const decision = session.decide('frame.award', { seat: 'A' })
      if (decision._tag !== 'accepted') throw new Error('expected award acceptance')
      expect(decision.result.outcome).toEqual({ winnerSeat: 'A', score: { A: 10, B: 0 }, winReason: 'target-reached' })
      apply(session, { type: 'frame.award', seat: 'A' })
      expect(session.state.phase).toBe('frame-over')
    } finally {
      session.dispose()
    }
  })

  test('post-frame-over commands reject', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    try {
      apply(session, { type: 'frame.commence', seat: 'A' })
      apply(session, { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4, 5] })
      apply(session, { type: 'frame.award', seat: 'A' })
      const before = structuredClone(session.state)
      expect(session.decide('pot.record', { seat: 'A', pottedBalls: [6] })._tag).toBe('rejected')
      expect(session.state).toEqual(before)
    } finally {
      session.dispose()
    }
  })

  test('one session retains one actor across warm commands', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    try {
      apply(session, { type: 'frame.commence', seat: 'A' })
      const afterCommence = structuredClone(session.state)
      apply(session, { type: 'pot.record', seat: 'A', pottedBalls: [1] })
      expect(session.state.score.A).toBe(afterCommence.score.A + 2)
      apply(session, { type: 'pot.record', seat: 'B', pottedBalls: [2] })
      expect(session.state.phase).toBe('open-play')
      expect(session.state.score).toEqual({ A: 2, B: 2 })
    } finally {
      session.dispose()
    }
  })
})

describe('StrilaGameplaySession snapshot binding', () => {
  test('apply rejects when resident actor snapshot diverged before commit', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    try {
      const decision = session.decide('frame.commence', { seat: 'A' })
      if (decision._tag !== 'accepted') throw new Error('expected accepted decision')

      apply(session, { type: 'frame.commence', seat: 'A' })

      expect(() => session.applyCommitted(decision.transition)).toThrow(InvalidPreparedTransitionError)
      expect(() => session.applyCommitted(decision.transition)).toThrow('Prepared transition previous snapshot mismatch')
    } finally {
      session.dispose()
    }
  })

  test('apply verifies candidate snapshot and serialized result after send', () => {
    const session = createGameplaySession('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
    try {
      const decision = session.decide('frame.commence', { seat: 'A' })
      if (decision._tag !== 'accepted') throw new Error('expected accepted decision')
      const result = session.applyCommitted(decision.transition)
      expect(session.state).toEqual(result.state)
      expect(session.state.phase).toBe('open-play')
    } finally {
      session.dispose()
    }
  })
})

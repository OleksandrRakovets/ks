import { describe, expect, test } from 'bun:test'

import { type ControlCommandPayload } from '@ks/core'
import * as v from 'valibot'

import type { GameCreateStateArgs } from './constants'
import { type GameplaySession, GameplaySessionDisposedError, InvalidPreparedTransitionError } from './gameplay-session'
import type { RegisteredGameKey } from './registry'
import { createGameplaySession } from './session-factory'
import {
  StrilaControlViewSchema,
  StrilaFrameStateSchema,
  StrilaMeta,
  StrilaScoreboardViewSchema,
  StrilaSummaryViewSchema,
} from './strila-v2/definitions'

type SessionCommand = {
  commandType: string
  command: ControlCommandPayload
}

type SessionScenario<K extends RegisteredGameKey> = {
  gameKey: K
  createArgs: GameCreateStateArgs
  stateSchema: v.GenericSchema
  validCommand: SessionCommand
  malformedCommand: SessionCommand
  unavailableCommand: SessionCommand
  replayCommands: readonly SessionCommand[]
  sameRevisionSetupCommands?: readonly SessionCommand[]
  sameRevisionCommand: SessionCommand
  projectionSchemas: {
    control: v.GenericSchema
    scoreboard: v.GenericSchema
    summary: v.GenericSchema
  }
}

function expectInvalidPreparedTransition(fn: () => void, messages: string | readonly string[]) {
  const expected = Array.isArray(messages) ? messages : [messages]
  try {
    fn()
    throw new Error(`Expected InvalidPreparedTransitionError: ${expected.join(' | ')}`)
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidPreparedTransitionError)
    if (!(error instanceof InvalidPreparedTransitionError)) throw error
    expect(expected.includes(error.message)).toBe(true)
  }
}

const staleTokenMessages = [
  'Prepared transition revision is stale',
  'Prepared transition previous snapshot mismatch',
  'Prepared transition previous state mismatch',
] as const

export function defineGameplaySessionContractSuite<K extends RegisteredGameKey>(scenario: SessionScenario<K>) {
  describe(`gameplay session contract (${scenario.gameKey})`, () => {
    test('initial state and all projections satisfy schemas', () => {
      const session = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        expect(v.safeParse(scenario.stateSchema, session.state).success).toBe(true)
        expect(v.safeParse(scenario.projectionSchemas.control, session.deriveControl()).success).toBe(true)
        expect(v.safeParse(scenario.projectionSchemas.scoreboard, session.deriveScoreboard()).success).toBe(true)
        expect(v.safeParse(scenario.projectionSchemas.summary, session.deriveSummary()).success).toBe(true)
      } finally {
        session.dispose()
      }
    })

    test('decide does not mutate resident state', () => {
      const session = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        const before = structuredClone(session.state)
        session.decide(scenario.validCommand.commandType, scenario.validCommand.command)
        expect(session.state).toEqual(before)
      } finally {
        session.dispose()
      }
    })

    test('accepted decision returns deterministic result and opaque token', () => {
      const session = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        for (const command of scenario.sameRevisionSetupCommands ?? []) {
          const setup = session.decide(command.commandType, command.command)
          if (setup._tag !== 'accepted') throw new Error('expected accepted setup command')
          session.applyCommitted(setup.transition)
        }

        const first = session.decide(scenario.sameRevisionCommand.commandType, scenario.sameRevisionCommand.command)
        const second = session.decide(scenario.sameRevisionCommand.commandType, scenario.sameRevisionCommand.command)
        if (first._tag !== 'accepted' || second._tag !== 'accepted') throw new Error('expected accepted decisions')

        expect(first.result).toEqual(second.result)
        expect(first.result.protocolEntries).toEqual(second.result.protocolEntries)
        expect(Object.keys(first.transition)).toEqual(['gameKey'])
        expect(Object.keys(second.transition)).toEqual(['gameKey'])
        expect(first.transition).not.toBe(second.transition)
      } finally {
        session.dispose()
      }
    })

    test('apply advances resident state once', () => {
      const session = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        const before = structuredClone(session.state)
        const decision = session.decide(scenario.validCommand.commandType, scenario.validCommand.command)
        if (decision._tag !== 'accepted') throw new Error('expected accepted decision')
        const result = session.applyCommitted(decision.transition)
        expect(session.state).toEqual(result.state)
        expect(session.state).not.toEqual(before)
      } finally {
        session.dispose()
      }
    })

    test('reused token throws as consumed', () => {
      const session = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        const decision = session.decide(scenario.validCommand.commandType, scenario.validCommand.command)
        if (decision._tag !== 'accepted') throw new Error('expected accepted decision')
        session.applyCommitted(decision.transition)
        expectInvalidPreparedTransition(
          () => session.applyCommitted(decision.transition),
          'Prepared transition was already consumed',
        )
      } finally {
        session.dispose()
      }
    })

    test('stale token throws after another token from the same revision applies', () => {
      const session = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        for (const command of scenario.sameRevisionSetupCommands ?? []) {
          const setup = session.decide(command.commandType, command.command)
          if (setup._tag !== 'accepted') throw new Error('expected accepted setup command')
          session.applyCommitted(setup.transition)
        }

        const first = session.decide(scenario.sameRevisionCommand.commandType, scenario.sameRevisionCommand.command)
        const second = session.decide(scenario.sameRevisionCommand.commandType, scenario.sameRevisionCommand.command)
        if (first._tag !== 'accepted' || second._tag !== 'accepted') throw new Error('expected accepted decisions')

        session.applyCommitted(first.transition)
        expectInvalidPreparedTransition(() => session.applyCommitted(second.transition), staleTokenMessages)
      } finally {
        session.dispose()
      }
    })

    test('foreign token throws', () => {
      const owner = createGameplaySession(scenario.gameKey, scenario.createArgs)
      const foreign = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        const decision = owner.decide(scenario.validCommand.commandType, scenario.validCommand.command)
        if (decision._tag !== 'accepted') throw new Error('expected accepted decision')
        expect(() => foreign.applyCommitted(decision.transition)).toThrow(InvalidPreparedTransitionError)
      } finally {
        owner.dispose()
        foreign.dispose()
      }
    })

    test('two decisions at one revision become mutually stale after one applies', () => {
      const session = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        for (const command of scenario.sameRevisionSetupCommands ?? []) {
          const setup = session.decide(command.commandType, command.command)
          if (setup._tag !== 'accepted') throw new Error('expected accepted setup command')
          session.applyCommitted(setup.transition)
        }

        const first = session.decide(scenario.sameRevisionCommand.commandType, scenario.sameRevisionCommand.command)
        const second = session.decide(scenario.sameRevisionCommand.commandType, scenario.sameRevisionCommand.command)
        if (first._tag !== 'accepted' || second._tag !== 'accepted') throw new Error('expected accepted decisions')

        session.applyCommitted(first.transition)
        expectInvalidPreparedTransition(() => session.applyCommitted(second.transition), staleTokenMessages)
      } finally {
        session.dispose()
      }
    })

    test('malformed and unavailable commands reject without mutation', () => {
      const session = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        const before = structuredClone(session.state)
        expect(session.decide(scenario.malformedCommand.commandType, scenario.malformedCommand.command)._tag).toBe('rejected')
        expect(session.state).toEqual(before)
        expect(session.decide(scenario.unavailableCommand.commandType, scenario.unavailableCommand.command)._tag).toBe(
          'rejected',
        )
        expect(session.state).toEqual(before)
      } finally {
        session.dispose()
      }
    })

    test('warm sequential commands equal replay into a fresh session', () => {
      const warm = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        for (const command of scenario.replayCommands) {
          const decision = warm.decide(command.commandType, command.command)
          if (decision._tag !== 'accepted') throw new Error(`expected accepted replay command ${command.commandType}`)
          warm.applyCommitted(decision.transition)
        }
        const warmState = warm.state

        const cold = createGameplaySession(scenario.gameKey, scenario.createArgs)
        try {
          for (const command of scenario.replayCommands) {
            const decision = cold.decide(command.commandType, command.command)
            if (decision._tag !== 'accepted') throw new Error(`expected accepted cold replay command ${command.commandType}`)
            cold.applyCommitted(decision.transition)
          }
          expect(cold.state).toEqual(warmState)
        } finally {
          cold.dispose()
        }
      } finally {
        warm.dispose()
      }
    })

    test('dispose is idempotent and later operations throw', () => {
      const session = createGameplaySession(scenario.gameKey, scenario.createArgs)
      session.dispose()
      session.dispose()
      expect(() => session.state).toThrow(GameplaySessionDisposedError)
      expect(() => session.decide('frame.commence', { seat: 'A' })).toThrow(GameplaySessionDisposedError)
    })

    test('dispose invalidates a prepared token for another session', () => {
      const owner = createGameplaySession(scenario.gameKey, scenario.createArgs)
      const receiver = createGameplaySession(scenario.gameKey, scenario.createArgs)
      try {
        const decision = owner.decide(scenario.validCommand.commandType, scenario.validCommand.command)
        if (decision._tag !== 'accepted') throw new Error('expected accepted decision')
        owner.dispose()
        expectInvalidPreparedTransition(
          () => receiver.applyCommitted(decision.transition),
          'Prepared transition owner is no longer active',
        )
      } finally {
        receiver.dispose()
      }
    })
  })
}

export function applyWarmCommand<K extends RegisteredGameKey>(
  session: GameplaySession<K>,
  commandType: string,
  command: ControlCommandPayload,
) {
  const decision = session.decide(commandType, command)
  if (decision._tag !== 'accepted') throw new Error(`Expected accepted command ${commandType}`)
  return session.applyCommitted(decision.transition)
}

defineGameplaySessionContractSuite({
  gameKey: 'strila-v2',
  createArgs: { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' },
  stateSchema: StrilaFrameStateSchema,
  validCommand: { commandType: 'frame.commence', command: { seat: 'A' } },
  malformedCommand: { commandType: 'pot.record', command: {} },
  unavailableCommand: { commandType: 'pot.record', command: { seat: 'A', pottedBalls: [99] } },
  replayCommands: [
    { commandType: 'frame.commence', command: { seat: 'A' } },
    { commandType: 'pot.record', command: { seat: 'A', pottedBalls: [1] } },
    { commandType: 'pot.record', command: { seat: 'B', pottedBalls: [2] } },
  ],
  sameRevisionSetupCommands: [{ commandType: 'frame.commence', command: { seat: 'A' } }],
  sameRevisionCommand: { commandType: 'pot.record', command: { seat: 'A', pottedBalls: [1] } },
  projectionSchemas: {
    control: StrilaControlViewSchema,
    scoreboard: StrilaScoreboardViewSchema,
    summary: StrilaSummaryViewSchema,
  },
})

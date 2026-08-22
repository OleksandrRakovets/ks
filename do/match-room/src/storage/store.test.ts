import { describe, expect, test } from 'bun:test'

import { type MatchFact, MatchIdSchema, newCommandId, newFactId, UnixEpochMillisecondsSchema } from '@ks/core'
import * as v from 'valibot'

import { createTestStore } from './test-helpers'

const matchId = v.parse(MatchIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
const createdAt = v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000)
const controlSecret = 'control-secret-1234567890'

const matchConfig = {
  matchId,
  gameKey: 'free-pyramid' as const,
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A' as const,
}

function creationFact(): MatchFact {
  return {
    factId: newFactId(),
    matchId,
    occurredAt: createdAt,
    causedByCommandId: null,
    type: 'match.created',
    payload: matchConfig,
  }
}

function commandFact(commandId: ReturnType<typeof newCommandId>, type: 'frame.started' | 'match.ended'): MatchFact {
  const occurredAt = v.parse(UnixEpochMillisecondsSchema, createdAt + (type === 'frame.started' ? 1 : 2))
  if (type === 'frame.started') {
    return {
      factId: newFactId(),
      matchId,
      occurredAt,
      causedByCommandId: commandId,
      type,
      payload: {
        frameIndex: 1,
        gameKey: matchConfig.gameKey,
        targetPointsBySeat: matchConfig.targets.frameTargetPointsBySeat,
        breakerSeat: 'A',
      },
    }
  }
  return {
    factId: newFactId(),
    matchId,
    occurredAt,
    causedByCommandId: commandId,
    type,
    payload: { winnerSeat: 'A' },
  }
}

function initializeStore() {
  const store = createTestStore()
  const initialization = {
    matchId,
    controlSecret,
    configJson: JSON.stringify(matchConfig),
    createdAt,
  }
  const stored = store.commitCreation({ initialization, fact: creationFact() })
  return { store, initialization, stored }
}

describe('ActiveMatchStore', () => {
  test('commitCreation atomically inserts the room and sole creation fact', () => {
    const store = createTestStore()
    const stored = store.commitCreation({
      initialization: {
        matchId,
        controlSecret,
        configJson: JSON.stringify(matchConfig),
        createdAt,
      },
      fact: creationFact(),
    })

    expect(stored.seq).toBe(1)
    expect(stored.causedByCommandId).toBeNull()
    expect(store.match()).toMatchObject({ matchId, latestSeq: 1, status: 'active' })
    expect(store.factsAfter(0)).toEqual([stored])
    expect(() =>
      store.commitCreation({
        initialization: {
          matchId,
          controlSecret,
          configJson: JSON.stringify(matchConfig),
          createdAt,
        },
        fact: creationFact(),
      }),
    ).toThrow('Match already exists')
  })

  test('commitAccepted allocates contiguous sequences for multi-fact batches and stores tagged receipts', () => {
    const { store } = initializeStore()
    const commandId = newCommandId()
    const requestJson = '{"source":"match","commandType":"frame.start","command":{}}'
    const started = commandFact(commandId, 'frame.started')
    const ended = commandFact(commandId, 'match.ended')
    const facts: [MatchFact, ...MatchFact[]] = [started, ended]

    const committed = store.commitAccepted({ facts, receipt: { commandId, requestJson } })

    expect(committed.storedFacts.map((fact) => fact.seq)).toEqual([2, 3])
    expect(committed.outcome).toEqual({
      _tag: 'accepted',
      accepted: committed.storedFacts.map(({ seq, factId }) => ({ seq, factId })),
    })
    expect(store.match()?.latestSeq).toBe(3)
    expect(store.match()?.status).toBe('finalizing')
    expect(store.receipt(commandId)).toEqual({ requestJson, outcome: committed.outcome })
  })

  test('commitAccepted requires matching command causation on every fact', () => {
    const { store } = initializeStore()
    const commandId = newCommandId()
    const otherCommandId = newCommandId()
    const fact = commandFact(otherCommandId, 'frame.started')
    const facts: [MatchFact, ...MatchFact[]] = [fact]

    expect(() =>
      store.commitAccepted({
        facts,
        receipt: { commandId, requestJson: '{}' },
      }),
    ).toThrow('Fact causation mismatch')
  })

  test('commitRejected stores only the tagged receipt without changing sequence or status', () => {
    const { store } = initializeStore()
    const commandId = newCommandId()
    const requestJson = '{"source":"match","commandType":"frame.start","command":{}}'

    const outcome = store.commitRejected({
      receipt: { commandId, requestJson },
      reason: { code: 'no-active-frame' },
    })

    expect(outcome).toEqual({ _tag: 'rejected', reason: { code: 'no-active-frame' } })
    expect(store.match()).toMatchObject({ latestSeq: 1, status: 'active' })
    expect(store.factsAfter(0)).toHaveLength(1)
    expect(store.receipt(commandId)).toEqual({ requestJson, outcome })
  })

  test('rejected receipts stay idempotent after accepted state changes', () => {
    const { store } = initializeStore()
    const rejectedCommandId = newCommandId()
    const rejectedRequest = '{"source":"match","commandType":"frame.start","command":{}}'
    store.commitRejected({
      receipt: { commandId: rejectedCommandId, requestJson: rejectedRequest },
      reason: { code: 'frame-already-active' },
    })

    const acceptedCommandId = newCommandId()
    store.commitAccepted({
      facts: [commandFact(acceptedCommandId, 'frame.started')],
      receipt: { commandId: acceptedCommandId, requestJson: rejectedRequest },
    })

    expect(store.receipt(rejectedCommandId)).toEqual({
      requestJson: rejectedRequest,
      outcome: { _tag: 'rejected', reason: { code: 'frame-already-active' } },
    })
    expect(store.match()?.latestSeq).toBe(2)
  })

  test('rolls back commitCreation when fact insertion fails after room insert', () => {
    const store = createTestStore({ failOnAcceptedFactInsert: true })
    let caught: unknown

    try {
      store.commitCreation({
        initialization: {
          matchId,
          controlSecret,
          configJson: JSON.stringify(matchConfig),
          createdAt,
        },
        fact: creationFact(),
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toEqual(
      expect.objectContaining({
        cause: expect.objectContaining({ message: 'Injected accepted_facts insert failure' }),
      }),
    )
    expect(store.match()).toBeNull()
    expect(store.factsAfter(0)).toHaveLength(0)
  })

  test('rolls back accepted commits on injected storage failure', () => {
    const { store } = initializeStore()
    const commandId = newCommandId()
    const first = commandFact(commandId, 'frame.started')
    const duplicateFactId = { ...commandFact(commandId, 'match.ended'), factId: first.factId }

    expect(() =>
      store.commitAccepted({
        facts: [first, duplicateFactId],
        receipt: { commandId, requestJson: '{}' },
      }),
    ).toThrow()

    expect(store.match()).toMatchObject({ latestSeq: 1, status: 'active' })
    expect(store.factsAfter(0)).toHaveLength(1)
    expect(store.receipt(commandId)).toBeNull()
  })
})

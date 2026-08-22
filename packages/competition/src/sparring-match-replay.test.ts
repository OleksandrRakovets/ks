import { describe, expect, test } from 'bun:test'

import {
  type CommandId,
  type MatchConfig,
  type MatchFactDraft,
  newCommandId,
  newFactId,
  newMatchId,
  type StoredMatchFact,
  StoredMatchFactSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import * as v from 'valibot'

import { buildMatchConfig, CreateMatchRequestSchema } from './matches'
import {
  createSparringMatchSession,
  draftSparringMatchCreation,
  replaySparringMatch,
  restoreSparringMatchSession,
  type SparringMatchCommand,
  SparringMatchReplayError,
  type SparringMatchSession,
} from './sparring-match'

const createRequest = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: {
    frameTargetPointsBySeat: { A: 2, B: 2 },
    matchTargetFrames: 1,
  },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: 'gp_01HX0000000000000000000000' },
    { seat: 'B', playerRef: 'gp_01HX0000000000000000000001' },
  ],
})

function makeConfig(): MatchConfig {
  return buildMatchConfig(newMatchId(), createRequest)
}

function toStored(
  draft: MatchFactDraft,
  config: MatchConfig,
  seq: number,
  commandId: CommandId,
  occurredAt: number,
): StoredMatchFact {
  const envelope = {
    factId: newFactId(),
    matchId: config.matchId,
    occurredAt,
    receivedAt: occurredAt + 1,
    seq,
    type: draft.type,
    payload: draft.payload,
  }
  return v.parse(StoredMatchFactSchema, {
    ...envelope,
    causedByCommandId: draft.type === 'match.created' ? null : commandId,
  })
}

function nonemptyStoredFacts(facts: StoredMatchFact[]): [StoredMatchFact, ...StoredMatchFact[]] {
  const [first, ...rest] = facts
  if (!first) throw new Error('Expected at least one stored fact')
  return [first, ...rest]
}

function acceptWarm(
  session: SparringMatchSession,
  command: SparringMatchCommand,
  seq: number,
  commandId: CommandId,
  occurredAt: number,
): StoredMatchFact[] {
  const decision = session.decide(command)
  if (decision._tag !== 'accepted') throw new Error(`Expected accepted decision for ${command.type}`)
  const facts = nonemptyStoredFacts(
    decision.facts.map((draft, index) => toStored(draft, session.state.config, seq + index, commandId, occurredAt)),
  )
  session.applyCommitted(decision.transition, facts)
  return [...facts]
}

function buildValidTerminalJournal(config = makeConfig()): [StoredMatchFact, ...StoredMatchFact[]] {
  const session = createSparringMatchSession(config)
  const occurredAt = 1000
  let seq = 1
  const journal: StoredMatchFact[] = [toStored(draftSparringMatchCreation(config), config, seq++, newCommandId(), occurredAt)]
  try {
    for (const command of [
      { type: 'frame.start' },
      { type: 'frame.commence', seat: 'A' as const },
      { type: 'game.command', commandType: 'pot.record', command: { seat: 'A' as const, points: 2 } },
      { type: 'game.command', commandType: 'frame.award', command: { seat: 'A' as const } },
    ] satisfies SparringMatchCommand[]) {
      journal.push(...acceptWarm(session, command, seq, newCommandId(), occurredAt))
      seq = journal.at(-1)!.seq + 1
    }
    return nonemptyStoredFacts(journal)
  } finally {
    session.dispose()
  }
}

function renumber(facts: StoredMatchFact[]): [StoredMatchFact, ...StoredMatchFact[]] {
  return nonemptyStoredFacts(facts.map((fact, index) => ({ ...fact, seq: index + 1 })))
}

function expectReplayError(mutator: (facts: StoredMatchFact[]) => StoredMatchFact[], messageIncludes: string) {
  const facts = renumber(mutator([...buildValidTerminalJournal()]))
  expect(() => replaySparringMatch(facts)).toThrow(SparringMatchReplayError)
  try {
    replaySparringMatch(facts)
  } catch (error) {
    expect(error).toBeInstanceOf(SparringMatchReplayError)
    if (!(error instanceof SparringMatchReplayError)) throw error
    expect(error.message).toContain(messageIncludes)
  }
}

describe('sparring match replay corruption', () => {
  test('replays a valid terminal journal', () => {
    const facts = buildValidTerminalJournal()
    const state = replaySparringMatch(facts)
    expect(state.phase).toBe('match-over')
    expect(state.winnerSeat).toBe('A')
  })

  test('replays adjacent command batches that share the same occurredAt', () => {
    const facts = buildValidTerminalJournal()
    const sharedOccurredAt = v.parse(UnixEpochMillisecondsSchema, 1000)
    const normalized = nonemptyStoredFacts(
      facts.map((fact) => (fact.type === 'match.created' ? fact : { ...fact, occurredAt: sharedOccurredAt })),
    )
    const commandIds = new Set(normalized.filter((fact) => fact.type !== 'match.created').map((fact) => fact.causedByCommandId))
    expect(commandIds.size).toBeGreaterThan(1)
    expect(replaySparringMatch(normalized).phase).toBe('match-over')
  })

  test('rejects unknown registered creation game keys', () => {
    const config: MatchConfig = {
      matchId: newMatchId(),
      gameKey: 'historical-game',
      targets: createRequest.targets,
      firstBreakerSeat: 'A',
    }
    expect(() =>
      replaySparringMatch(
        nonemptyStoredFacts([toStored({ type: 'match.created', payload: config }, config, 1, newCommandId(), 1000)]),
      ),
    ).toThrow(SparringMatchReplayError)
  })

  test('failed replay disposes temporary gameplay and restore remains usable', () => {
    const config = makeConfig()
    const session = createSparringMatchSession(config)
    const occurredAt = 1000
    let seq = 1
    const journal: StoredMatchFact[] = [toStored(draftSparringMatchCreation(config), config, seq++, newCommandId(), occurredAt)]
    try {
      journal.push(...acceptWarm(session, { type: 'frame.start' }, seq, newCommandId(), occurredAt))
      seq = journal.at(-1)!.seq + 1
      const badJournal = nonemptyStoredFacts([
        ...journal,
        toStored(
          {
            type: 'game.command',
            payload: {
              frameIndex: 1,
              gameKey: config.gameKey,
              commandType: 'pot.record',
              command: { seat: 'A', points: 1 },
              protocolEntries: [{ source: 'system', entryType: 'system-note', body: {} }],
            },
          },
          config,
          seq,
          newCommandId(),
          occurredAt,
        ),
      ])
      expect(() => replaySparringMatch(badJournal)).toThrow(SparringMatchReplayError)

      const restored = restoreSparringMatchSession(nonemptyStoredFacts(journal))
      try {
        expect(restored.state.phase).toBe('frame-in-progress')
        expect(restored.state.activeGame).not.toBeNull()
        const decision = restored.decide({ type: 'frame.commence', seat: 'A' })
        expect(decision._tag).toBe('accepted')
      } finally {
        restored.dispose()
      }
    } finally {
      session.dispose()
    }
  })

  test('replaySparringMatch disposes temporary gameplay after materializing mid-frame state', () => {
    const config = makeConfig()
    const session = createSparringMatchSession(config)
    const occurredAt = 1000
    let seq = 1
    const journal: StoredMatchFact[] = [toStored(draftSparringMatchCreation(config), config, seq++, newCommandId(), occurredAt)]
    try {
      journal.push(...acceptWarm(session, { type: 'frame.start' }, seq, newCommandId(), occurredAt))
      seq = journal.at(-1)!.seq + 1
      journal.push(...acceptWarm(session, { type: 'frame.commence', seat: 'A' }, seq, newCommandId(), occurredAt))
      seq = journal.at(-1)!.seq + 1
      journal.push(
        ...acceptWarm(
          session,
          { type: 'game.command', commandType: 'pot.record', command: { seat: 'A', points: 2 } },
          seq,
          newCommandId(),
          occurredAt,
        ),
      )

      const cold = replaySparringMatch(nonemptyStoredFacts(journal))
      expect(cold.phase).toBe('frame-in-progress')
      expect(cold.activeGame).not.toBeNull()

      const restored = restoreSparringMatchSession(nonemptyStoredFacts(journal))
      try {
        expect(restored.state).toEqual(cold)
        expect(restored.decide({ type: 'game.command', commandType: 'frame.award', command: { seat: 'A' } })._tag).toBe(
          'accepted',
        )
      } finally {
        restored.dispose()
      }
    } finally {
      session.dispose()
    }
  })

  test('rejects sequence gaps and non-contiguous numbering', () => {
    const facts = [...buildValidTerminalJournal()]
    facts[2] = { ...facts[2]!, seq: 9 }
    expect(() => replaySparringMatch(nonemptyStoredFacts(facts))).toThrow(SparringMatchReplayError)
  })

  test('rejects wrong first fact and duplicate creation', () => {
    expectReplayError((facts) => {
      const copy = [...facts]
      const second = copy[1]
      if (second?.type !== 'frame.started') throw new Error('expected frame.started')
      copy[0] = toStored({ type: 'frame.started', payload: second.payload }, makeConfig(), 1, newCommandId(), 1000)
      return copy
    }, 'match.created')

    expectReplayError((facts) => [...facts, { ...facts[0]!, seq: facts.length + 1, factId: newFactId() }], 'match.created')
  })

  test('rejects identity, config, breaker, and index mismatches', () => {
    expectReplayError((facts) => {
      const copy = [...facts]
      copy[0] = { ...copy[0]!, matchId: newMatchId() }
      return copy
    }, 'identity')

    expectReplayError((facts) => {
      const copy = [...facts]
      if (copy[1]?.type !== 'frame.started') throw new Error('expected frame.started')
      copy[1] = { ...copy[1], payload: { ...copy[1].payload, frameIndex: 2 } }
      return copy
    }, 'Frame index mismatch')

    expectReplayError((facts) => {
      const copy = [...facts]
      if (copy[1]?.type !== 'frame.started') throw new Error('expected frame.started')
      copy[1] = { ...copy[1], payload: { ...copy[1].payload, breakerSeat: 'B' } }
      return copy
    }, 'breaker')
  })

  test('rejects game command without frame and duplicate completion', () => {
    expectReplayError((facts) => facts.filter((fact) => fact.type !== 'frame.started'), 'without active frame')

    expectReplayError((facts) => {
      const completion = facts.find((fact) => fact.type === 'frame.completed')
      if (!completion) throw new Error('missing completion')
      return [...facts, { ...completion, factId: newFactId() }]
    }, 'duplicate frame completions')
  })

  test('rejects missing or wrong terminal fact after match-winning completion', () => {
    expectReplayError((facts) => facts.filter((fact) => fact.type !== 'match.ended'), 'match.ended')

    expectReplayError((facts) => {
      const copy = [...facts]
      const terminalIndex = copy.findIndex((fact) => fact.type === 'match.ended')
      const terminal = copy[terminalIndex]
      if (!terminal || terminal.type !== 'match.ended') throw new Error('missing terminal fact')
      copy[terminalIndex] = { ...terminal, payload: { winnerSeat: 'B' } }
      return copy
    }, 'Terminal winner')
  })

  test('rejects protocol mismatch and post-terminal facts', () => {
    expectReplayError((facts) => {
      const copy = [...facts]
      const game = copy.find((fact) => fact.type === 'game.command' && fact.payload.commandType === 'pot.record')
      if (!game || game.type !== 'game.command') throw new Error('missing pot fact')
      copy[copy.indexOf(game)] = {
        ...game,
        payload: { ...game.payload, protocolEntries: [{ source: 'system', entryType: 'system-note', body: {} }] },
      }
      return copy
    }, 'protocol')

    expectReplayError((facts) => {
      const copy = [...facts]
      const started = copy[1]
      if (started?.type !== 'frame.started') throw new Error('expected frame.started')
      copy.push(
        toStored({ type: 'frame.started', payload: started.payload }, makeConfig(), copy.length + 1, newCommandId(), 1000),
      )
      return copy
    }, 'terminal')
  })

  test('rejects frame game configuration mismatch', () => {
    expectReplayError((facts) => {
      const copy = [...facts]
      if (copy[1]?.type !== 'frame.started') throw new Error('expected frame.started')
      copy[1] = {
        ...copy[1],
        payload: { ...copy[1].payload, gameConfiguration: { rackRollover: 15 } },
      }
      return copy
    }, 'game configuration')
  })

  test('rejects missing or mismatched completion after outcome-producing game command', () => {
    expectReplayError((facts) => {
      const copy = facts.filter((fact) => fact.type !== 'frame.completed' && fact.type !== 'match.ended')
      return copy
    }, 'Missing expected frame.completed')

    expectReplayError((facts) => {
      const copy = [...facts]
      const completionIndex = copy.findIndex((fact) => fact.type === 'frame.completed')
      const completion = copy[completionIndex]
      if (!completion || completion.type !== 'frame.completed') throw new Error('missing completion')
      copy[completionIndex] = {
        ...completion,
        payload: {
          ...completion.payload,
          outcome: {
            ...completion.payload.outcome,
            winReason: 'conceded',
          },
        },
      }
      return copy
    }, 'Frame completion outcome mismatch')
  })

  test('rejects unexpected target-reached completion and concession score mismatch', () => {
    expectReplayError((facts) => {
      const copy = [...facts]
      const awardIndex = copy.findIndex((fact) => fact.type === 'game.command' && fact.payload.commandType === 'frame.award')
      if (awardIndex === -1) throw new Error('missing award command')
      const completion = copy[awardIndex + 1]
      const terminal = copy[awardIndex + 2]
      if (!completion || completion.type !== 'frame.completed') throw new Error('missing completion')
      if (!terminal || terminal.type !== 'match.ended') throw new Error('missing terminal')
      return [...copy.slice(0, awardIndex), completion, terminal]
    }, 'Unexpected frame completion without preceding game outcome')

    const concessionConfig = buildMatchConfig(newMatchId(), {
      ...createRequest,
      targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 3 },
    })
    const session = createSparringMatchSession(concessionConfig)
    const occurredAt = 1000
    let seq = 1
    const journal: StoredMatchFact[] = [
      toStored(draftSparringMatchCreation(concessionConfig), concessionConfig, seq++, newCommandId(), occurredAt),
    ]
    try {
      journal.push(...acceptWarm(session, { type: 'frame.start' }, seq, newCommandId(), occurredAt))
      seq = journal.at(-1)!.seq + 1
      journal.push(...acceptWarm(session, { type: 'frame.commence', seat: 'A' }, seq, newCommandId(), occurredAt))
      seq = journal.at(-1)!.seq + 1
      const decision = session.decide({ type: 'frame.concede', seat: 'A' })
      if (decision._tag !== 'accepted') throw new Error('expected concede acceptance')
      const concedeCommandId = newCommandId()
      const facts = nonemptyStoredFacts(
        decision.facts.map((draft, index) => toStored(draft, session.state.config, seq + index, concedeCommandId, occurredAt)),
      )
      const completion = facts[0]
      if (!completion || completion.type !== 'frame.completed') throw new Error('expected completion')
      facts[0] = {
        ...completion,
        payload: {
          ...completion.payload,
          outcome: {
            ...completion.payload.outcome,
            score: { A: 99, B: 0 },
          },
        },
      }
      expect(() => replaySparringMatch(nonemptyStoredFacts([...journal, ...facts]))).toThrow(SparringMatchReplayError)
    } finally {
      session.dispose()
    }
  })

  test('rejects batch binding mismatches within multi-fact accepted batches', () => {
    expectReplayError((facts) => {
      const copy = [...facts]
      const terminalIndex = copy.findIndex((fact) => fact.type === 'match.ended')
      const terminal = copy[terminalIndex]
      if (!terminal || terminal.type !== 'match.ended') throw new Error('missing terminal')
      copy[terminalIndex] = {
        ...terminal,
        occurredAt: v.parse(UnixEpochMillisecondsSchema, terminal.occurredAt + 1),
      }
      return copy
    }, 'occurrence time')

    expectReplayError((facts) => {
      const copy = [...facts]
      const completionIndex = copy.findIndex((fact) => fact.type === 'frame.completed')
      const completion = copy[completionIndex]
      if (!completion || completion.type !== 'frame.completed') throw new Error('missing completion')
      copy[completionIndex] = { ...completion, causedByCommandId: newCommandId() }
      return copy
    }, 'Missing expected frame.completed')
  })
})

describe('sparring match replay parity note', () => {
  test('automatic terminal batch differs from old reducer requiring explicit match.end command', () => {
    const facts = buildValidTerminalJournal()
    expect(facts.some((fact) => fact.type === 'match.ended')).toBe(true)
    expect(replaySparringMatch(facts).phase).toBe('match-over')
  })
})

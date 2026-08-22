import { describe, expect, test } from 'bun:test'

import {
  type CommandId,
  type ControlCommand,
  type MatchConfig,
  type MatchFactDraft,
  newCommandId,
  newFactId,
  newMatchId,
  type StoredMatchFact,
  StoredMatchFactSchema,
} from '@ks/core'
import { listGameKeys, type RegisteredGameKey } from '@ks/gameplay/definitions'
import * as v from 'valibot'

import { buildMatchConfig, CreateMatchRequestSchema } from './matches'
import {
  createSparringMatchSession,
  draftSparringMatchCreation,
  InvalidSparringPreparedTransitionError,
  parseSparringMatchCommand,
  replaySparringMatch,
  restoreSparringMatchSession,
  type SparringMatchCommand,
  type SparringMatchSession,
  SparringMatchSessionDisposedError,
} from './sparring-match'

const createRequest = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: {
    frameTargetPointsBySeat: { A: 8, B: 8 },
    matchTargetFrames: 3,
  },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: 'gp_01HX0000000000000000000000' },
    { seat: 'B', playerRef: 'gp_01HX0000000000000000000001' },
  ],
})

function makeConfig(gameKey: RegisteredGameKey, matchTargetFrames = 1, frameTarget = 8): MatchConfig {
  return buildMatchConfig(newMatchId(), {
    ...createRequest,
    gameKey,
    targets: {
      frameTargetPointsBySeat: { A: frameTarget, B: frameTarget },
      matchTargetFrames,
    },
    gameConfiguration: gameKey === 'free-pyramid-long' ? { rackRollover: 14 } : undefined,
  })
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
  const before = structuredClone(session.state)
  const decision = session.decide(command)
  if (decision._tag !== 'accepted') throw new Error(`Expected accepted decision for ${command.type}`)
  expect(session.state).toEqual(before)

  const facts = nonemptyStoredFacts(
    decision.facts.map((draft, index) => toStored(draft, session.state.config, seq + index, commandId, occurredAt)),
  )
  session.applyCommitted(decision.transition, facts)
  return [...facts]
}

function expectRejected(session: SparringMatchSession, command: SparringMatchCommand) {
  const before = structuredClone(session.state)
  const decision = session.decide(command)
  expect(decision._tag).toBe('rejected')
  expect(session.state).toEqual(before)
  return decision
}

describe('sparring match creation and parsing', () => {
  test('draftSparringMatchCreation returns match.created draft', () => {
    const config = makeConfig('free-pyramid')
    expect(draftSparringMatchCreation(config)).toEqual({ type: 'match.created', payload: config })
  })

  test('rejects unknown registered game keys at creation boundaries', () => {
    const unknownConfig: MatchConfig = {
      matchId: newMatchId(),
      gameKey: 'historical-game',
      targets: createRequest.targets,
      firstBreakerSeat: 'A',
    }
    expect(() => draftSparringMatchCreation(unknownConfig)).toThrow()
    expect(() => createSparringMatchSession(unknownConfig)).toThrow()
  })

  test('parseSparringMatchCommand maps match and game control envelopes', () => {
    expect(parseSparringMatchCommand({ source: 'match', commandType: 'frame.start', command: {} })).toEqual({
      _tag: 'parsed',
      command: { type: 'frame.start' },
    })
    expect(parseSparringMatchCommand({ source: 'match', commandType: 'frame.commence', command: { seat: 'A' } })).toEqual({
      _tag: 'parsed',
      command: { type: 'frame.commence', seat: 'A' },
    })
    expect(parseSparringMatchCommand({ source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 1 } })).toEqual(
      {
        _tag: 'parsed',
        command: { type: 'game.command', commandType: 'pot.record', command: { seat: 'A', points: 1 } },
      },
    )
  })

  test('unsupported match commands return parse-failed', () => {
    expect(parseSparringMatchCommand({ source: 'match', commandType: 'match.end', command: {} })).toEqual({
      _tag: 'parse-failed',
      reason: { code: 'unsupported-match-command', commandType: 'match.end' },
    })
  })
})

describe('sparring match command rejections', () => {
  test('rejects commands when match is over', () => {
    const config = makeConfig('free-pyramid', 1, 2)
    const session = createSparringMatchSession(config)
    try {
      const commandId = newCommandId()
      acceptWarm(session, { type: 'frame.start' }, 1, commandId, 1000)
      acceptWarm(session, { type: 'frame.commence', seat: 'A' }, 2, commandId, 1000)
      acceptWarm(
        session,
        { type: 'game.command', commandType: 'pot.record', command: { seat: 'A', points: 2 } },
        3,
        commandId,
        1000,
      )
      acceptWarm(session, { type: 'game.command', commandType: 'frame.award', command: { seat: 'A' } }, 4, commandId, 1000)
      expectRejected(session, { type: 'frame.start' })
      const overDecision = session.decide({ type: 'frame.start' })
      expect(overDecision._tag).toBe('rejected')
      if (overDecision._tag === 'rejected') expect(overDecision.reason.code).toBe('match-already-over')
    } finally {
      session.dispose()
    }
  })

  test('rejects frame.start while frame is active', () => {
    const session = createSparringMatchSession(makeConfig('free-pyramid'))
    try {
      acceptWarm(session, { type: 'frame.start' }, 1, newCommandId(), 1000)
      expectRejected(session, { type: 'frame.start' })
      const activeDecision = session.decide({ type: 'frame.start' })
      expect(activeDecision._tag).toBe('rejected')
      if (activeDecision._tag === 'rejected') expect(activeDecision.reason.code).toBe('frame-already-active')
    } finally {
      session.dispose()
    }
  })

  test('rejects frame.commence for wrong breaker', () => {
    const session = createSparringMatchSession(makeConfig('free-pyramid'))
    try {
      acceptWarm(session, { type: 'frame.start' }, 1, newCommandId(), 1000)
      const decision = expectRejected(session, { type: 'frame.commence', seat: 'B' })
      if (decision._tag !== 'rejected') throw new Error('expected rejection')
      expect(decision.reason).toEqual({ code: 'wrong-breaker', expectedSeat: 'A' })
    } finally {
      session.dispose()
    }
  })

  test('rejects gameplay commands without active frame', () => {
    const session = createSparringMatchSession(makeConfig('free-pyramid'))
    try {
      const decision = expectRejected(session, {
        type: 'game.command',
        commandType: 'pot.record',
        command: { seat: 'A', points: 1 },
      })
      if (decision._tag !== 'rejected') throw new Error('expected rejection')
      expect(decision.reason.code).toBe('no-active-frame')
    } finally {
      session.dispose()
    }
  })
})

describe('sparring match prepared transitions', () => {
  test('applyCommitted verifies owner, revision, and single-use tokens', () => {
    const session = createSparringMatchSession(makeConfig('free-pyramid'))
    const foreign = createSparringMatchSession(makeConfig('free-pyramid'))
    try {
      const commandId = newCommandId()
      const decision = session.decide({ type: 'frame.start' })
      if (decision._tag !== 'accepted') throw new Error('expected accepted')
      const facts = nonemptyStoredFacts(
        decision.facts.map((draft, index) => toStored(draft, session.state.config, index + 1, commandId, 1000)),
      )

      expect(() => foreign.applyCommitted(decision.transition, facts)).toThrow(InvalidSparringPreparedTransitionError)
      session.applyCommitted(decision.transition, facts)
      expect(() => session.applyCommitted(decision.transition, facts)).toThrow(InvalidSparringPreparedTransitionError)

      const stale = session.decide({ type: 'frame.commence', seat: 'A' })
      if (stale._tag !== 'accepted') throw new Error('expected accepted commence')
      const staleFacts = nonemptyStoredFacts(
        stale.facts.map((draft) => toStored(draft, session.state.config, 2, commandId, 1000)),
      )
      acceptWarm(session, { type: 'frame.commence', seat: 'A' }, 2, commandId, 1000)
      expect(() => session.applyCommitted(stale.transition, staleFacts)).toThrow(InvalidSparringPreparedTransitionError)
    } finally {
      session.dispose()
      foreign.dispose()
    }
  })

  test('applyCommitted rejects draft payload mismatches and batch binding defects', () => {
    const session = createSparringMatchSession(makeConfig('free-pyramid', 1, 2))
    try {
      const commandId = newCommandId()
      acceptWarm(session, { type: 'frame.start' }, 1, commandId, 1000)
      acceptWarm(session, { type: 'frame.commence', seat: 'A' }, 2, commandId, 1000)
      acceptWarm(
        session,
        { type: 'game.command', commandType: 'pot.record', command: { seat: 'A', points: 2 } },
        3,
        commandId,
        1000,
      )
      const decision = session.decide({ type: 'game.command', commandType: 'frame.award', command: { seat: 'A' } })
      if (decision._tag !== 'accepted') throw new Error('expected accepted')
      const facts = nonemptyStoredFacts(
        decision.facts.map((draft, index) => toStored(draft, session.state.config, 5 + index, commandId, 1000)),
      )
      const firstFact = facts[0]
      if (firstFact?.type !== 'game.command') throw new Error('expected game.command fact')
      facts[0] = toStored(
        {
          type: 'game.command',
          payload: {
            ...firstFact.payload,
            protocolEntries: [{ source: 'system', entryType: 'system-note', body: {} }],
          },
        },
        session.state.config,
        firstFact.seq,
        commandId,
        1000,
      )
      expect(() => session.applyCommitted(decision.transition, facts)).toThrow(InvalidSparringPreparedTransitionError)

      const replayDecision = session.decide({ type: 'game.command', commandType: 'frame.award', command: { seat: 'A' } })
      if (replayDecision._tag !== 'accepted') throw new Error('expected accepted')
      const replayFacts = nonemptyStoredFacts(
        replayDecision.facts.map((draft, index) => toStored(draft, session.state.config, 10 + index, commandId, 1000)),
      )
      const secondFact = replayFacts[1]
      if (!secondFact || secondFact.type === 'match.created') throw new Error('expected command fact')
      replayFacts[1] = { ...secondFact, causedByCommandId: newCommandId() }
      expect(() => session.applyCommitted(replayDecision.transition, replayFacts)).toThrow(
        InvalidSparringPreparedTransitionError,
      )
    } finally {
      session.dispose()
    }
  })

  test('applyCommitted rejects a batch enveloped with another match ID without changing session state', () => {
    const session = createSparringMatchSession(makeConfig('free-pyramid'))
    const foreignMatchId = newMatchId()
    try {
      const before = structuredClone(session.state)
      const decision = session.decide({ type: 'frame.start' })
      if (decision._tag !== 'accepted') throw new Error('expected accepted')
      const facts = nonemptyStoredFacts(
        decision.facts.map((draft, index) => {
          const stored = toStored(draft, session.state.config, index + 1, newCommandId(), 1000)
          return { ...stored, matchId: foreignMatchId }
        }),
      )
      expect(() => session.applyCommitted(decision.transition, facts)).toThrow(InvalidSparringPreparedTransitionError)
      expect(session.state).toEqual(before)
    } finally {
      session.dispose()
    }
  })
})

const frameTargetByGame = {
  'strila-v2': 9,
  'free-pyramid': 2,
  'free-pyramid-long': 2,
  'combined-pyramid': 2,
  'combined-pyramid-old': 2,
} satisfies Record<RegisteredGameKey, number>

function pushWarm(
  journal: StoredMatchFact[],
  session: SparringMatchSession,
  command: SparringMatchCommand,
  seq: number,
  commandId: CommandId,
  occurredAt: number,
): number {
  const facts = acceptWarm(session, command, seq, commandId, occurredAt)
  journal.push(...facts)
  return seq + facts.length
}

describe('sparring match per-game warm path', () => {
  for (const gameKey of listGameKeys()) {
    test(`${gameKey}: gameplay session, winner-determined retention, award terminal batch, warm=cold`, () => {
      const config = makeConfig(gameKey, 1, frameTargetByGame[gameKey])
      const session = createSparringMatchSession(config)
      const occurredAt = 1000
      let seq = 1
      const journal: StoredMatchFact[] = [
        toStored(draftSparringMatchCreation(config), config, seq++, newCommandId(), occurredAt),
      ]

      try {
        seq = pushWarm(journal, session, { type: 'frame.start' }, seq, newCommandId(), occurredAt)
        expect(session.state.activeGame?.gameKey).toBe(gameKey)
        expect(session.state.phase).toBe('frame-in-progress')

        seq = pushWarm(journal, session, { type: 'frame.commence', seat: 'A' }, seq, newCommandId(), occurredAt)
        seq = pushWarm(
          journal,
          session,
          {
            type: 'game.command',
            commandType: 'pot.record',
            command:
              gameKey === 'strila-v2'
                ? { seat: 'A', pottedBalls: [1, 2, 3, 4, 5] }
                : { seat: 'A', points: frameTargetByGame[gameKey] },
          },
          seq,
          newCommandId(),
          occurredAt,
        )
        expect(session.state.activeGame?.state.phase).toBe('winner-determined')
        expect(session.state.phase).toBe('frame-in-progress')
        expect(session.state.activeGame).not.toBeNull()

        seq = pushWarm(
          journal,
          session,
          { type: 'game.command', commandType: 'frame.award', command: { seat: 'A' } },
          seq,
          newCommandId(),
          occurredAt,
        )
        expect(session.state.phase).toBe('match-over')
        expect(session.state.activeGame).toBeNull()
        expect(session.project(10).controlSections.neutral).toEqual([])

        const cold = replaySparringMatch(nonemptyStoredFacts(journal))
        expect(cold).toEqual(session.state)

        const restored = restoreSparringMatchSession(nonemptyStoredFacts(journal))
        try {
          expect(restored.project(10)).toEqual(session.project(10))
        } finally {
          restored.dispose()
        }
      } finally {
        session.dispose()
        expect(() => session.decide({ type: 'frame.start' })).toThrow(SparringMatchSessionDisposedError)
      }
    })
  }
})

describe('sparring match automatic terminal facts', () => {
  test('match-winning frame award emits game.command, frame.completed, and match.ended in order', () => {
    const config = makeConfig('free-pyramid', 1, 2)
    const session = createSparringMatchSession(config)
    try {
      const commandId = newCommandId()
      acceptWarm(session, { type: 'frame.start' }, 1, commandId, 1000)
      acceptWarm(session, { type: 'frame.commence', seat: 'A' }, 2, commandId, 1000)
      acceptWarm(
        session,
        { type: 'game.command', commandType: 'pot.record', command: { seat: 'A', points: 2 } },
        3,
        commandId,
        1000,
      )
      const decision = session.decide({ type: 'game.command', commandType: 'frame.award', command: { seat: 'A' } })
      if (decision._tag !== 'accepted') throw new Error('expected award acceptance')
      expect(decision.facts.map((fact) => fact.type)).toEqual(['game.command', 'frame.completed', 'match.ended'])
    } finally {
      session.dispose()
    }
  })

  test('concession emits frame.completed and match.ended when target is reached', () => {
    const config = makeConfig('free-pyramid', 1, 2)
    const session = createSparringMatchSession(config)
    try {
      const commandId = newCommandId()
      acceptWarm(session, { type: 'frame.start' }, 1, commandId, 1000)
      acceptWarm(session, { type: 'frame.commence', seat: 'A' }, 2, commandId, 1000)
      const decision = session.decide({ type: 'frame.concede', seat: 'A' })
      if (decision._tag !== 'accepted') throw new Error('expected concede acceptance')
      expect(decision.facts.map((fact) => fact.type)).toEqual(['frame.completed', 'match.ended'])
    } finally {
      session.dispose()
    }
  })
})

describe('sparring match projection controls', () => {
  test('exposes frame.start between frames and breaker commence before open play', () => {
    const session = createSparringMatchSession(makeConfig('free-pyramid'))
    try {
      expect(session.project(0).controlSections.neutral.map((entry) => entry.commandType)).toEqual(['frame.start'])
      acceptWarm(session, { type: 'frame.start' }, 1, newCommandId(), 1000)
      expect(session.project(1).controlSections.primary.A.map((entry) => entry.commandType)).toEqual(['frame.commence'])
      acceptWarm(session, { type: 'frame.commence', seat: 'A' }, 2, newCommandId(), 1000)
      const sections = session.project(2).controlSections
      expect(sections.tertiary.A.map((entry) => entry.commandType)).toContain('frame.concede')
      expect(sections.tertiary.B.map((entry) => entry.commandType)).toContain('frame.concede')
    } finally {
      session.dispose()
    }
  })
})

describe('sparring match prepared transition internals', () => {
  test('two decisions at one revision become mutually stale after one applies', () => {
    const session = createSparringMatchSession(makeConfig('free-pyramid'))
    try {
      acceptWarm(session, { type: 'frame.start' }, 1, newCommandId(), 1000)
      const first = session.decide({ type: 'frame.commence', seat: 'A' })
      const second = session.decide({ type: 'frame.commence', seat: 'A' })
      if (first._tag !== 'accepted' || second._tag !== 'accepted') throw new Error('expected accepted')
      const commandId = newCommandId()
      const facts = nonemptyStoredFacts(first.facts.map((draft) => toStored(draft, session.state.config, 2, commandId, 1000)))
      session.applyCommitted(first.transition, facts)
      expect(() => session.applyCommitted(second.transition, facts)).toThrow(InvalidSparringPreparedTransitionError)
      expect(Object.getOwnPropertySymbols(first.transition)).toHaveLength(1)
      expect(() => session.applyCommitted(first.transition, facts)).toThrow(InvalidSparringPreparedTransitionError)
    } finally {
      session.dispose()
    }
  })
})

function parseControl(command: ControlCommand) {
  return parseSparringMatchCommand(command)
}

test('malformed nested game payload remains available for gameplay rejection path', () => {
  const session = createSparringMatchSession(makeConfig('free-pyramid'))
  try {
    acceptWarm(session, { type: 'frame.start' }, 1, newCommandId(), 1000)
    acceptWarm(session, { type: 'frame.commence', seat: 'A' }, 2, newCommandId(), 1000)
    const parsed = parseControl({ source: 'game', commandType: 'pot.record', command: {} })
    expect(parsed._tag).toBe('parsed')
    if (parsed._tag !== 'parsed') throw new Error('expected parsed')
    const decision = session.decide(parsed.command)
    expect(decision._tag).toBe('rejected')
    if (decision._tag !== 'rejected') throw new Error('expected rejected')
    expect(decision.reason.code).toBe('game-command-rejected')
  } finally {
    session.dispose()
  }
})

import { describe, expect, test } from 'bun:test'

import { type MatchConfig, newMatchId } from '@ks/core'

import { draftSparringMatchCreation, restoreSparringMatch } from './sparring-match'

function config(target = 2): MatchConfig {
  return {
    matchId: newMatchId(),
    gameKey: 'free-pyramid',
    targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: target },
    firstBreakerSeat: 'A',
  }
}

describe('SparringMatch', () => {
  test('drafts creation without resident state and executes accepted commands speculatively', () => {
    const creation = draftSparringMatchCreation(config())
    const match = restoreSparringMatch([[creation]])
    expect(match.execute({ source: 'match', commandType: 'frame.start', command: {} })).toMatchObject({
      _tag: 'accepted',
      facts: [{ type: 'frame.started', payload: { frameIndex: 1, breakerSeat: 'A' } }],
    })
    expect(match.project().state).toMatchObject({ status: 'active', currentFrameIndex: 1 })
  })

  test('parses behind execute and keeps expected rejection as valid behavior', () => {
    const match = restoreSparringMatch([[draftSparringMatchCreation(config())]])
    expect(match.execute({ source: 'match', commandType: 'unknown', command: {} })).toEqual({
      _tag: 'parse-failed',
      reason: { code: 'unsupported-match-command', commandType: 'unknown' },
    })
    expect(match.execute({ source: 'match', commandType: 'frame.concede', command: { seat: 'A' } })).toEqual({
      _tag: 'rejected',
      reason: { code: 'no-active-frame' },
    })
  })

  test('restored semantic batches produce the same warm projection', () => {
    const creation = draftSparringMatchCreation(config())
    const warm = restoreSparringMatch([[creation]])
    const started = warm.execute({ source: 'match', commandType: 'frame.start', command: {} })
    expect(started._tag).toBe('accepted')
    if (started._tag !== 'accepted') throw new Error('Expected accepted frame start')
    const restored = restoreSparringMatch([[creation], started.facts])
    expect(restored.project()).toEqual(warm.project())
  })

  test('executes gameplay through terminal batching and restores the same terminal projection', () => {
    const creation = draftSparringMatchCreation(config(1))
    const warm = restoreSparringMatch([[creation]])
    const history = [[creation]] as const
    const accepted = [
      warm.execute({ source: 'match', commandType: 'frame.start', command: {} }),
      warm.execute({ source: 'match', commandType: 'frame.commence', command: { seat: 'A' } }),
      warm.execute({ source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 4 } }),
      warm.execute({ source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 4 } }),
      warm.execute({ source: 'game', commandType: 'frame.award', command: { seat: 'A' } }),
    ]
    for (const result of accepted) expect(result._tag).toBe('accepted')
    const batches = accepted.map((result) => {
      if (result._tag !== 'accepted') throw new Error('Expected accepted command')
      return result.facts
    })
    expect(batches.at(-1)?.map((fact) => fact.type)).toEqual(['game.command', 'frame.completed', 'match.ended'])

    const restored = restoreSparringMatch([...history, ...batches])
    expect(warm.project().state).toMatchObject({ status: 'finished', framesWonBySeat: { A: 1, B: 0 } })
    expect(restored.project()).toEqual(warm.project())
  })

  test('enforces alternating breaker policy and records concession completion', () => {
    const match = restoreSparringMatch([[draftSparringMatchCreation(config())]])
    expect(match.execute({ source: 'match', commandType: 'frame.start', command: {} })).toMatchObject({
      _tag: 'accepted',
      facts: [{ type: 'frame.started', payload: { frameIndex: 1, breakerSeat: 'A' } }],
    })
    expect(match.execute({ source: 'match', commandType: 'frame.commence', command: { seat: 'B' } })).toEqual({
      _tag: 'rejected',
      reason: { code: 'wrong-breaker', expectedSeat: 'A' },
    })
    expect(match.execute({ source: 'match', commandType: 'frame.concede', command: { seat: 'A' } })).toMatchObject({
      _tag: 'accepted',
      facts: [{ type: 'frame.completed', payload: { frameIndex: 1, outcome: { winnerSeat: 'B', winReason: 'conceded' } } }],
    })
    expect(match.execute({ source: 'match', commandType: 'frame.start', command: {} })).toMatchObject({
      _tag: 'accepted',
      facts: [{ type: 'frame.started', payload: { frameIndex: 2, breakerSeat: 'B' } }],
    })
  })

  test('ordinary accepted gameplay emits only the ordered game.command fact', () => {
    const match = restoreSparringMatch([[draftSparringMatchCreation(config())]])
    match.execute({ source: 'match', commandType: 'frame.start', command: {} })
    match.execute({ source: 'match', commandType: 'frame.commence', command: { seat: 'A' } })
    const result = match.execute({ source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 1 } })
    expect(result).toMatchObject({
      _tag: 'accepted',
      facts: [
        { type: 'game.command', payload: { commandType: 'pot.record', protocolEntries: [{ scoreAfter: { A: 1, B: 0 } }] } },
      ],
    })
    if (result._tag === 'accepted') expect(result.facts.map((fact) => fact.type)).toEqual(['game.command'])
  })
})

import { describe, expect, test } from 'bun:test'

import { type AcceptedCommandHistoryEntry, type MatchConfig, newMatchId } from '@ks/core'

import { createSparringMatch, restoreSparringMatch } from './sparring-match'

function config(target = 2): MatchConfig {
  return {
    matchId: newMatchId(),
    gameKey: 'free-pyramid',
    targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: target },
    firstBreakerSeat: 'A',
  }
}

function accept(match: ReturnType<typeof createSparringMatch>, command: Parameters<typeof match.execute>[0]) {
  const result = match.execute(command)
  if (result._tag !== 'accepted') throw new Error(`Expected acceptance, received ${result._tag}`)
  return result
}

describe('SparringMatch', () => {
  test('creation is outside history and prepare emits a focal-seat lifecycle entry', () => {
    const match = createSparringMatch(config())
    expect(match.project().state.currentFrameIndex).toBe(0)
    expect(accept(match, { source: 'match', commandType: 'frame.prepare', command: {} })).toMatchObject({
      command: { source: 'match', commandType: 'frame.prepare', command: {} },
      protocolEntries: [{ entryType: 'frame-prepared', frameIndex: 1, seat: 'A' }],
    })
  })

  test('retains canonical commands and restores by comparing semantic Protocol', () => {
    const matchConfig = config()
    const warm = createSparringMatch(matchConfig)
    const history: AcceptedCommandHistoryEntry[] = []
    for (const command of [
      { source: 'match', commandType: 'frame.prepare', command: {} },
      { source: 'match', commandType: 'frame.commence', command: { seat: 'A' } },
      { source: 'game', commandType: 'pot.record', command: { pottedBallCount: 1, seat: 'A' } },
    ] as const) {
      const accepted = accept(warm, command)
      history.push({ command: accepted.command, protocolEntries: [...accepted.protocolEntries] })
    }
    // SAFETY: this fixture is built from typed accepted results immediately above.
    const persisted = JSON.parse(JSON.stringify(history)) as AcceptedCommandHistoryEntry[]
    expect(restoreSparringMatch(matchConfig, persisted).project()).toEqual(warm.project())
  })

  test('concession records concession, award, and terminal match lifecycle in order', () => {
    const match = createSparringMatch(config(1))
    accept(match, { source: 'match', commandType: 'frame.prepare', command: {} })
    const result = accept(match, { source: 'match', commandType: 'frame.concede', command: { seat: 'A' } })
    expect(result.protocolEntries.map((entry) => [entry.entryType, entry.seat])).toEqual([
      ['frame-conceded', 'A'],
      ['frame-awarded', 'B'],
      ['match-ended', 'B'],
    ])
    expect(match.project().state.status).toBe('finished')
  })

  test('domain rejection does not mutate projection', () => {
    const match = createSparringMatch(config())
    const before = match.project()
    expect(match.execute({ source: 'match', commandType: 'frame.concede', command: { seat: 'A' } })).toMatchObject({
      _tag: 'rejected',
    })
    expect(match.project()).toEqual(before)
  })
})

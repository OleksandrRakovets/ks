import { describe, expect, test } from 'bun:test'

import {
  type AcceptedCommandHistoryEntry,
  type MatchCommand,
  type MatchConfig,
  newCommandId,
  newMatchId,
} from '@ks/core'

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
    expect(
      accept(match, { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } }),
    ).toMatchObject({
      command: { source: 'match', command: { type: 'frame.prepare' } },
      protocolEntryContents: [{ entryType: 'frame-prepared', frameIndex: 1, seat: 'A' }],
    })
  })

  test('retains accepted commands and restores by comparing semantic Protocol', () => {
    const matchConfig = config()
    const warm = createSparringMatch(matchConfig)
    const history: AcceptedCommandHistoryEntry[] = []
    for (const submitted of [
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
      {
        commandId: newCommandId(),
        source: 'game',
        command: { type: 'pot.record', pottedBallCount: 1, seat: 'A' },
      },
    ] satisfies MatchCommand[]) {
      const accepted = accept(warm, submitted)
      history.push({ command: accepted.command, protocolEntryContents: [...accepted.protocolEntryContents] })
    }
    // SAFETY: this fixture is built from typed accepted results immediately above.
    const persisted = JSON.parse(JSON.stringify(history)) as AcceptedCommandHistoryEntry[]
    expect(restoreSparringMatch(matchConfig, persisted).project()).toEqual(warm.project())
  })

  test('concession records concession, award, and terminal match lifecycle in order', () => {
    const match = createSparringMatch(config(1))
    accept(match, { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } })
    const result = accept(match, {
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'frame.concede', seat: 'A' },
    })
    expect(result.protocolEntryContents.map((entry) => [entry.entryType, entry.seat])).toEqual([
      ['frame-conceded', 'A'],
      ['frame-awarded', 'B'],
      ['match-ended', 'B'],
    ])
    expect(match.project().state.status).toBe('finished')
  })

  test('domain rejection does not mutate projection', () => {
    const match = createSparringMatch(config())
    const before = match.project()
    expect(
      match.execute({
        commandId: newCommandId(),
        source: 'match',
        command: { type: 'frame.concede', seat: 'A' },
      }),
    ).toMatchObject({
      _tag: 'rejected',
    })
    expect(match.project()).toEqual(before)
  })
})

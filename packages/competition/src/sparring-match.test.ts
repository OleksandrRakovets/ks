import { describe, expect, test } from 'bun:test'

import {
  type AcceptedCommand,
  type MatchCommand,
  type MatchConfig,
  newCommandId,
  newMatchId,
  nowUnixEpochMilliseconds,
} from '@ks/core'

import { parseProtocolEntryContent } from './protocol'
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

  test('restores accepted commands and correlates newly derived Protocol', () => {
    const matchConfig = config()
    const warm = createSparringMatch(matchConfig)
    const history: AcceptedCommand[] = []
    for (const submitted of [
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
      {
        commandId: newCommandId(),
        source: 'game',
        command: { type: 'pot.record', pottedBallCount: 1, seat: 'A' },
      },
    ] satisfies MatchCommand[]) {
      accept(warm, submitted)
      history.push({
        ...submitted,
        acceptedSeq: history.length + 1,
        acceptedAt: nowUnixEpochMilliseconds(),
      })
    }
    // SAFETY: this fixture is built from typed accepted results immediately above.
    const persisted = JSON.parse(JSON.stringify(history)) as AcceptedCommand[]
    const restored = restoreSparringMatch(matchConfig, persisted)
    expect(restored.match.project()).toEqual(warm.project())
    expect(restored.accepted.map(({ acceptedCommand }) => acceptedCommand)).toEqual(persisted)
  })

  test('accepts and restores a below-target Strila outcome before and after award', () => {
    const matchConfig: MatchConfig = {
      ...config(1),
      gameKey: 'strila-v2',
      targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 1 },
    }
    const match = createSparringMatch(matchConfig)
    const history: AcceptedCommandHistoryEntry[] = []
    for (const submitted of [
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
      {
        commandId: newCommandId(),
        source: 'game',
        command: { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4] },
      },
      {
        commandId: newCommandId(),
        source: 'game',
        command: { type: 'pot.record', seat: 'B', pottedBalls: [5, 6, 7] },
      },
    ] satisfies MatchCommand[]) {
      const accepted = accept(match, submitted)
      for (const entry of accepted.protocolEntryContents)
        expect(parseProtocolEntryContent(entry)).toEqual(entry)
      history.push({ command: accepted.command, protocolEntryContents: [...accepted.protocolEntryContents] })
    }
    // SAFETY: history contains only typed accepted results serialized as persisted JSON.
    const restored = restoreSparringMatch(
      matchConfig,
      JSON.parse(JSON.stringify(history)) as AcceptedCommandHistoryEntry[],
    )
    expect(restored.project()).toEqual(match.project())
    expect(restored.project().state.framesWonBySeat).toEqual({ A: 0, B: 0 })

    const awarded = accept(restored, {
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'frame.award', seat: 'A' },
    })
    for (const entry of awarded.protocolEntryContents) expect(parseProtocolEntryContent(entry)).toEqual(entry)
    expect(awarded.protocolEntryContents).toContainEqual({
      gameKey: 'strila-v2',
      frameIndex: 1,
      source: 'system',
      entryType: 'frame-awarded',
      seat: 'A',
      scoreAfter: { A: 8, B: 6 },
      body: { winReason: 'game-rules' },
    })
    expect(restored.project().state).toMatchObject({
      status: 'finished',
      framesWonBySeat: { A: 1, B: 0 },
      frames: [{ winnerSeat: 'A', pointsBySeat: { A: 8, B: 6 } }],
    })
    history.push({ command: awarded.command, protocolEntryContents: [...awarded.protocolEntryContents] })
    // SAFETY: history contains only typed accepted results serialized as persisted JSON.
    const completed = restoreSparringMatch(
      matchConfig,
      JSON.parse(JSON.stringify(history)) as AcceptedCommandHistoryEntry[],
    )
    expect(completed.project()).toEqual(restored.project())
  })

  test('plays a multi-frame race through game scoring with alternating breakers', () => {
    const match = createSparringMatch(config())

    for (const breakerSeat of ['A', 'B', 'A'] as const) {
      const prepared = accept(match, {
        commandId: newCommandId(),
        source: 'match',
        command: { type: 'frame.prepare' },
      })
      expect(prepared.protocolEntryContents[0]).toMatchObject({
        entryType: 'frame-prepared',
        seat: breakerSeat,
      })
      accept(match, {
        commandId: newCommandId(),
        source: 'match',
        command: { type: 'frame.commence', seat: breakerSeat },
      })
      for (let point = 0; point < 8; point += 1)
        accept(match, {
          commandId: newCommandId(),
          source: 'game',
          command: { type: 'pot.record', seat: breakerSeat, pottedBallCount: 1 },
        })
      accept(match, {
        commandId: newCommandId(),
        source: 'game',
        command: { type: 'frame.award', seat: breakerSeat },
      })
    }

    expect(match.project().state).toMatchObject({
      status: 'finished',
      currentFrameIndex: 3,
      framesWonBySeat: { A: 2, B: 1 },
      frames: [
        { frameIndex: 1, breakerSeat: 'A', winnerSeat: 'A' },
        { frameIndex: 2, breakerSeat: 'B', winnerSeat: 'B' },
        { frameIndex: 3, breakerSeat: 'A', winnerSeat: 'A' },
      ],
    })
  })

  test('concession records concession, award, and match-completing lifecycle in order', () => {
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

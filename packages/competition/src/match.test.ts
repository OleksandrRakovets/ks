import { describe, expect, test } from 'bun:test'

import { type MatchCommand, type MatchConfig, newCommandId, newMatchId } from '@ks/core'
import * as v from 'valibot'

import { createMatch } from './match'
import { ProtocolEntryContent } from './protocol'

function config(target = 2): MatchConfig {
  return {
    matchId: newMatchId(),
    gameKey: 'free-pyramid',
    targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: target },
    firstBreakerSeat: 'A',
  }
}

function accept(match: ReturnType<typeof createMatch>, command: Parameters<typeof match.execute>[0]) {
  const result = match.execute(command)

  if (result._tag !== 'accepted') throw new Error(`Expected acceptance, received ${result._tag}`)

  return result
}

function observables(match: ReturnType<typeof createMatch>) {
  return {
    phase: match.phase(),
    state: match.state(),
    game: match.gamePresentation(),
    controls: match.controls(),
    gameResult: match.gameResult(),
  }
}

describe('Match', () => {
  test('creation precedes command execution and prepare emits a focal-seat lifecycle entry', () => {
    const match = createMatch(config())
    expect(match.state().currentFrameIndex).toBe(0)
    expect(
      accept(match, { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } }),
    ).toMatchObject({
      command: { source: 'match', command: { type: 'frame.prepare' } },
      protocolEntryContents: [{ entryType: 'frame-prepared', frameIndex: 1, seat: 'A' }],
    })
  })

  test('accepts a below-target Strila outcome and emits complete Protocol through award', () => {
    const matchConfig: MatchConfig = {
      ...config(1),
      gameKey: 'strila-v2',
      targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 1 },
    }

    const match = createMatch(matchConfig)

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
        expect(v.parse(ProtocolEntryContent, entry)).toEqual(entry)
    }

    expect(match.state().framesWonBySeat).toEqual({ A: 0, B: 0 })

    const awarded = accept(match, {
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'frame.award', seat: 'A' },
    })

    for (const entry of awarded.protocolEntryContents)
      expect(v.parse(ProtocolEntryContent, entry)).toEqual(entry)
    expect(awarded.protocolEntryContents).toContainEqual({
      gameKey: 'strila-v2',
      frameIndex: 1,
      source: 'system',
      entryType: 'frame-awarded',
      seat: 'A',
      scoreAfter: { A: 8, B: 6 },
      body: { winReason: 'game-rules' },
    })
    expect(match.state()).toMatchObject({
      status: 'finished',
      framesWonBySeat: { A: 1, B: 0 },
      frames: [{ winnerSeat: 'A', pointsBySeat: { A: 8, B: 6 } }],
    })
  })

  test('plays a multi-frame race through game scoring with alternating breakers', () => {
    const match = createMatch(config())

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

    expect(match.state()).toMatchObject({
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

  test('concession records concession, award, and match-ending lifecycle in order', () => {
    const match = createMatch(config(1))
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
    expect(match.state().status).toBe('finished')
  })

  test('gameplay-determined winner removes concession controls and rejects either concession', () => {
    const match = createMatch({
      ...config(1),
      gameKey: 'strila-v2',
      targets: { frameTargetPointsBySeat: { A: 1, B: 9 }, matchTargetFrames: 1 },
    })

    accept(match, { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } })
    accept(match, {
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'frame.commence', seat: 'A' },
    })
    expect(match.controls().filter(({ type }) => type === 'frame.concede')).toHaveLength(2)
    accept(match, {
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBalls: [1] },
    })

    const determined = observables(match)
    expect(determined.controls.filter(({ type }) => type === 'frame.concede')).toEqual([])

    for (const seat of ['A', 'B'] as const) {
      expect(
        match.execute({
          commandId: newCommandId(),
          source: 'match',
          command: { type: 'frame.concede', seat },
        }),
      ).toEqual({
        _tag: 'rejected',
        reason: { code: 'game-command-rejected', reason: { code: 'command-not-available' } },
      })
      expect(observables(match)).toEqual(determined)
    }
  })

  test('domain rejection does not mutate observable state', () => {
    const match = createMatch(config())
    const before = observables(match)
    expect(
      match.execute({
        commandId: newCommandId(),
        source: 'match',
        command: { type: 'frame.concede', seat: 'A' },
      }),
    ).toMatchObject({
      _tag: 'rejected',
    })
    expect(observables(match)).toEqual(before)
  })
})

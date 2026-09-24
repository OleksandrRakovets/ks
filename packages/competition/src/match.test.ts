import { describe, expect, test } from 'bun:test'

import {
  type AcceptedCommand,
  type MatchCommand,
  type MatchConfig,
  newCommandId,
  newMatchId,
  SystemClock,
} from '@ks/core'

import { createMatch, restoreMatch } from './match'
import { parseProtocolEntryContent } from './protocol'

const clock = new SystemClock()

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

describe('Match', () => {
  test('creation is outside history and prepare emits a focal-seat lifecycle entry', () => {
    const match = createMatch(config())
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
    const warm = createMatch(matchConfig)
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
        acceptedAt: clock.nowMs(),
      })
    }

    // SAFETY: this fixture is built from typed accepted results immediately above.
    const persisted = JSON.parse(JSON.stringify(history)) as AcceptedCommand[]
    const restored = restoreMatch(matchConfig, persisted)
    expect(restored.match.project()).toEqual(warm.project())
    expect(restored.accepted.map(({ acceptedCommand }) => acceptedCommand)).toEqual(persisted)
  })

  test('accepts and restores a below-target Strila outcome before and after award', () => {
    const matchConfig: MatchConfig = {
      ...config(1),
      gameKey: 'strila-v2',
      targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 1 },
    }

    const match = createMatch(matchConfig)
    const history: AcceptedCommand[] = []

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
      history.push({
        ...submitted,
        acceptedSeq: history.length + 1,
        acceptedAt: clock.nowMs(),
      })
    }

    // SAFETY: this fixture is built from typed accepted results immediately above.
    const persisted = JSON.parse(JSON.stringify(history)) as AcceptedCommand[]
    const restored = restoreMatch(matchConfig, persisted).match
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
    history.push({
      ...awarded.command,
      acceptedSeq: history.length + 1,
      acceptedAt: clock.nowMs(),
    })

    // SAFETY: this fixture is built from typed accepted results immediately above.
    const completed = restoreMatch(matchConfig, JSON.parse(JSON.stringify(history)) as AcceptedCommand[]).match

    expect(completed.project()).toEqual(restored.project())
  })

  test('restores a Strila cue-ball streak cleared by an open-play miss', () => {
    const matchConfig: MatchConfig = {
      ...config(),
      gameKey: 'strila-v2',
      targets: { frameTargetPointsBySeat: { A: 9, B: 9 }, matchTargetFrames: 2 },
    }

    const resident = createMatch(matchConfig)
    const history: AcceptedCommand[] = []

    for (const submitted of [
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
      {
        commandId: newCommandId(),
        source: 'game',
        command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
      },
      {
        commandId: newCommandId(),
        source: 'game',
        command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
      },
      { commandId: newCommandId(), source: 'game', command: { type: 'miss.record', seat: 'B' } },
    ] satisfies MatchCommand[]) {
      accept(resident, submitted)
      history.push({
        ...submitted,
        acceptedSeq: history.length + 1,
        acceptedAt: clock.nowMs(),
      })
    }

    const restored = restoreMatch(
      matchConfig,
      // SAFETY: this fixture is built from typed accepted results immediately above.
      JSON.parse(JSON.stringify(history)) as AcceptedCommand[],
    ).match

    expect(restored.project()).toEqual(resident.project())

    const nextCuePot = {
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBalls: [0] },
    } satisfies MatchCommand

    const residentResult = accept(resident, nextCuePot)
    const restoredResult = accept(restored, nextCuePot)
    expect(restoredResult).toEqual(residentResult)
    expect(restored.project()).toEqual(resident.project())
    expect(restored.project().controls.filter(({ type }) => type === 'miss.record')).toHaveLength(0)
    expect(restoredResult.protocolEntryContents).toContainEqual({
      gameKey: 'strila-v2',
      frameIndex: 1,
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      scoreAfter: { A: 3, B: 0 },
      body: { commandType: 'pot.record', pottedBalls: [0] },
    })

    const secondCuePot = {
      ...nextCuePot,
      commandId: newCommandId(),
    }

    expect(accept(restored, secondCuePot)).toEqual(accept(resident, secondCuePot))
    expect(restored.project()).toEqual(resident.project())
    expect(restored.project().controls.filter(({ type }) => type === 'miss.record')).toHaveLength(2)
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
    expect(match.project().state.status).toBe('finished')
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
    expect(match.project().controls.filter(({ type }) => type === 'frame.concede')).toHaveLength(2)
    accept(match, {
      commandId: newCommandId(),
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBalls: [1] },
    })

    const determined = match.project()
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
      expect(match.project()).toEqual(determined)
    }
  })

  test('domain rejection does not mutate projection', () => {
    const match = createMatch(config())
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

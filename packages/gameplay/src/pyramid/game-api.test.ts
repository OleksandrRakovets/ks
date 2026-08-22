import { describe, expect, test } from 'bun:test'

import { applyGameCommand, createInitialGameState, deriveGameControl, deriveGameScoreboard } from '../gameplay'

describe('free pyramid: game api', () => {
  test('creates and updates game state', () => {
    let state = createInitialGameState('free-pyramid', { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' })

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'not-started',
      winner: null,
    })

    let protocolEntries
    ;({ state, protocolEntries } = applyGameCommand({
      gameKey: 'free-pyramid',
      state,
      commandType: 'frame.commence',
      command: { seat: 'A' },
    }))

    expect(state).toEqual({
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
      winner: null,
    })
    expect(protocolEntries).toEqual([
      { source: 'player', entryType: 'player-command', seat: 'A', body: { commandType: 'frame.commence' } },
    ])

    ;({ state, protocolEntries } = applyGameCommand({
      gameKey: 'free-pyramid',
      state,
      commandType: 'pot.record',
      command: { seat: 'A', points: 2 },
    }))

    expect(state).toEqual({
      pointsBySeat: { A: 2, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
      winner: null,
    })
    expect(protocolEntries).toEqual([
      {
        source: 'player',
        entryType: 'player-command',
        seat: 'A',
        scoreAfter: { A: 2, B: 0 },
        body: { commandType: 'pot.record', points: 2 },
      },
    ])
  })

  test('rejects invalid negative shot presets', () => {
    expect(() =>
      applyGameCommand({
        gameKey: 'free-pyramid',
        state: { pointsBySeat: { A: 1, B: 0 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play', winner: null },
        commandType: 'pot.record',
        command: { seat: 'A', points: -5 },
      }),
    ).toThrow('Command not available')
  })

  test('foul awards one point to opponent', () => {
    const { state } = applyGameCommand({
      gameKey: 'free-pyramid',
      state: { pointsBySeat: { A: 3, B: 2 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play', winner: null },
      commandType: 'foul.commit',
      command: { seat: 'A' },
    })

    expect(state).toEqual({
      pointsBySeat: { A: 3, B: 3 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
      winner: null,
    })
  })

  test('derives scoreboard projection', () => {
    expect(
      deriveGameScoreboard('free-pyramid', {
        pointsBySeat: { A: 4, B: 2 },
        targetPointsBySeat: { A: 8, B: 8 },
        phase: 'open-play',
        winner: null,
      }),
    ).toEqual({
      gameKey: 'free-pyramid',
      projection: 'scoreboard',
      score: { A: 4, B: 2 },
      details: { phase: 'open-play', winner: undefined },
    })
  })

  test('control has no manual break-off choices', () => {
    const projection = deriveGameControl('free-pyramid', {
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'not-started',
      winner: null,
    })

    expect(projection.gameKey).toBe('free-pyramid')
    expect(projection.projection).toBe('control')
    expect(projection.score).toEqual({ A: 0, B: 0 })
    expect(projection.details.phase).toBe('not-started')
    expect(projection.details.isPotCommandAvailable).toBe(false)
    expect(projection.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual([])
    expect(projection.details.commandSections.primary.B.map((entry) => entry.commandType)).toEqual([])
  })

  test('enters winner-determined after target', () => {
    const { state } = applyGameCommand({
      gameKey: 'free-pyramid',
      state: { pointsBySeat: { A: 7, B: 2 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play', winner: null },
      commandType: 'pot.record',
      command: { seat: 'A', points: 1 },
    })

    expect(state).toEqual({
      pointsBySeat: { A: 8, B: 2 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'winner-determined',
      winner: 'A',
    })
  })

  test('winner-determined control exposes award before winner +1 only', () => {
    const projection = deriveGameControl('free-pyramid', {
      pointsBySeat: { A: 10, B: 2 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'winner-determined',
      winner: 'A',
    })

    expect(projection.details.isPotCommandAvailable).toBe(true)
    expect(projection.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual(['frame.award'])
    expect(projection.details.commandSections.primary.B.map((entry) => entry.commandType)).toEqual([])
    expect(projection.details.commandSections.secondary.A.map((entry) => entry.commandType)).toEqual(['pot.record'])
    expect(projection.details.commandSections.secondary.B.map((entry) => entry.commandType)).toEqual([])
  })

  test('loser cannot score after winner is determined', () => {
    expect(() =>
      applyGameCommand({
        gameKey: 'free-pyramid',
        state: {
          pointsBySeat: { A: 10, B: 2 },
          targetPointsBySeat: { A: 8, B: 8 },
          phase: 'winner-determined',
          winner: 'A',
        },
        commandType: 'pot.record',
        command: { seat: 'B', points: 1 },
      }),
    ).toThrow('Command not available')
  })

  test('frame.award closes gameplay state', () => {
    const { state, protocolEntries } = applyGameCommand({
      gameKey: 'free-pyramid',
      state: {
        pointsBySeat: { A: 10, B: 2 },
        targetPointsBySeat: { A: 8, B: 8 },
        phase: 'winner-determined',
        winner: 'A',
      },
      commandType: 'frame.award',
      command: { seat: 'A' },
    })

    expect(state).toEqual({
      pointsBySeat: { A: 10, B: 2 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'frame-over',
      winner: 'A',
    })
    expect(protocolEntries).toEqual([
      { source: 'player', entryType: 'player-command', seat: 'A', body: { commandType: 'frame.award' } },
    ])
  })
})

describe('combined pyramid: game api', () => {
  test('rejects invalid negative shot presets', () => {
    expect(() =>
      applyGameCommand({
        gameKey: 'combined-pyramid',
        state: { pointsBySeat: { A: 1, B: 0 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play', winner: null },
        commandType: 'pot.record',
        command: { seat: 'A', points: -5 },
      }),
    ).toThrow('Command not available')
  })
})

describe('combined pyramid old: game api', () => {
  test('keeps negative score via offender foul', () => {
    const { state } = applyGameCommand({
      gameKey: 'combined-pyramid-old',
      state: { pointsBySeat: { A: 0, B: 0 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play', winner: null },
      commandType: 'foul.commit',
      command: { seat: 'A' },
    })

    expect(state).toEqual({
      pointsBySeat: { A: -1, B: 0 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
      winner: null,
    })
  })

  test('foul deducts offender and allows negative score', () => {
    const { state } = applyGameCommand({
      gameKey: 'combined-pyramid-old',
      state: { pointsBySeat: { A: 0, B: 4 }, targetPointsBySeat: { A: 8, B: 8 }, phase: 'open-play', winner: null },
      commandType: 'foul.commit',
      command: { seat: 'A' },
    })

    expect(state).toEqual({
      pointsBySeat: { A: -1, B: 4 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
      winner: null,
    })
  })

  test('control projects +1, +2 and foul deduction', () => {
    const projection = deriveGameControl('combined-pyramid-old', {
      pointsBySeat: { A: 2, B: 1 },
      targetPointsBySeat: { A: 8, B: 8 },
      phase: 'open-play',
      winner: null,
    })

    expect(projection.details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual(['pot.record'])
    expect(projection.details.commandSections.primary.B.map((entry) => entry.commandType)).toEqual(['pot.record'])
    expect(projection.details.commandSections.secondary.A.map((entry) => entry.commandType)).toEqual([
      'pot.record',
      'foul.commit',
    ])
    expect(projection.details.commandSections.secondary.B.map((entry) => entry.commandType)).toEqual([
      'pot.record',
      'foul.commit',
    ])
    expect(projection.details.commandSections.secondary.A.find((entry) => entry.commandType === 'foul.commit')?.effect).toBe(
      'offender-minus-one',
    )
  })
})

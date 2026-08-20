import { expect, test } from 'bun:test'

import { applyGameCommand, deriveGameControl, deriveGameScoreboard } from '../../gameplay'
import { type StrilaFrameState, StrilaMeta } from '../definitions'

function controlDetails(state: StrilaFrameState) {
  return deriveGameControl('strila-v2', state).details
}

function scoreboardDetails(state: StrilaFrameState) {
  return deriveGameScoreboard('strila-v2', state).details
}

test('simulation: game api: respotted black frame 1', () => {
  const state: StrilaFrameState = {
    score: { A: 8, B: 8 },
    targetPoints: StrilaMeta.defaultTargetPoints,
    coloredBallsOnTable: [7],
    cueBallSerialPots: null,
    foulOffender: null,
    winner: null,
    winnerDeterminationReason: null,
    phase: 'respotted-black.opening',
  }

  expect(scoreboardDetails(state).objectBalls).toEqual([7])
  expect(controlDetails(state).commandSections.primary.A.map((entry) => entry.commandType)).toEqual([
    'pot.record',
    'miss.record',
  ])
  expect(controlDetails(state).commandSections.secondary.A.map((entry) => entry.commandType)).toEqual(['foul.commit'])
  expect(controlDetails(state).commandSections.tertiary.A.map((entry) => entry.commandType)).toEqual([])

  const step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
    commandType: 'pot.record',
    command: { seat: 'A', pottedBalls: [7] },
  })
  expect(step.protocolEntries).toEqual([
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      scoreAfter: { A: 10, B: 8 },
      body: { commandType: 'pot.record', pottedBalls: [7] },
    },
    {
      source: 'system',
      entryType: 'system-note',
      seat: 'A',
      body: { systemType: 'winner-determined', reason: 'respotted-black-won' },
    },
  ])
  const next = step.state
  expect(controlDetails(next).commandSections.primary.A.map((entry) => entry.commandType)).toEqual([
    'pot.record',
    'frame.award',
  ])
  expect(scoreboardDetails(next).winner).toBe('A')
})

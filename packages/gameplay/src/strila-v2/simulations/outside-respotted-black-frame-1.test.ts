import { expect, test } from 'bun:test'

import { applyGameCommand } from '../../index'
import { type StrilaFrameState } from '../definitions'
import { deriveStrilaControlView } from '../projections/control'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'

test('simulation: outside: respotted black frame 1', () => {
  const state: StrilaFrameState = {
    score: { A: 8, B: 8 },
    coloredBallsOnTable: [7],
    phase: { type: 'respotted-black-opening', actor: 'A' },
  }

  expect(deriveStrilaScoreboardView(state).details.objectBalls).toEqual([7])
  expect(deriveStrilaControlView(state).availableCommands.map((entry) => entry.commandType)).toEqual([
    'record-pot',
    'record-miss',
    'foul-committed',
    'concede-frame',
  ])

  const step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
    commandType: 'record-pot',
    command: { actor: 'A', pottedBalls: [7] },
  })
  expect(step.protocolEntries).toEqual([
    { source: 'player', command: { type: 'record-pot', actor: 'A', pottedBalls: [7] } },
    {
      source: 'system',
      systemType: 'winner-determined',
      winner: 'A',
      reason: 'respotted-black-won',
    },
  ])
  expect(deriveStrilaControlView(step.state as StrilaFrameState).availableCommands.map((entry) => entry.commandType)).toEqual([
    'record-pot',
    'award-frame',
  ])
  expect(deriveStrilaScoreboardView(step.state as StrilaFrameState).details.winner).toBe('A')
})

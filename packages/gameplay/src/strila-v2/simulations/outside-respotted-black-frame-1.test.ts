import { expect, test } from 'bun:test'

import { applyGameCommand } from '../../index'
import { type StrilaFrameState } from '../definitions'
import { deriveStrilaControlView } from '../projections/control'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'

test('simulation: outside: respotted black frame 1', () => {
  const state: StrilaFrameState = {
    score: { A: 8, B: 8 },
    targetPointsBySeat: { A: 9, B: 9 },
    coloredBallsOnTable: [7],
    cueBallPotsInRun: 0,
    chooser: null,
    offender: null,
    winner: null,
    winReason: null,
    phase: 'respotted-black.opening',
  }

  expect(deriveStrilaScoreboardView(state).details.objectBalls).toEqual([7])
  expect(deriveStrilaControlView(state).details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual([
    'pot.record',
    'miss.record',
  ])
  expect(deriveStrilaControlView(state).details.commandSections.secondary.A.map((entry) => entry.commandType)).toEqual([
    'foul.commit',
  ])
  expect(deriveStrilaControlView(state).details.commandSections.tertiary.A.map((entry) => entry.commandType)).toEqual([
    'frame.concede',
  ])

  const step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
    commandType: 'pot.record',
    command: { actor: 'A', pottedBalls: [7] },
  })
  expect(step.protocolEntries).toEqual([
    { source: 'player', command: { type: 'pot.record', actor: 'A', pottedBalls: [7] } },
    {
      source: 'system',
      systemType: 'winner-determined',
      winner: 'A',
      reason: 'respotted-black-won',
    },
  ])
  expect(
    deriveStrilaControlView(step.state as StrilaFrameState).details.commandSections.primary.A.map((entry) => entry.commandType),
  ).toEqual(['pot.record', 'frame.award'])
  expect(deriveStrilaScoreboardView(step.state as StrilaFrameState).details.winner).toBe('A')
})

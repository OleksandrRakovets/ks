import { expect, test } from 'bun:test'

import { applyGameCommand } from '../../index'
import { StrilaFrameStateSchema, StrilaMeta, type StrilaFrameState } from '../definitions'
import { deriveStrilaControlView } from '../projections/control'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'

test('simulation: outside: respotted black frame 1', () => {
  const state: StrilaFrameState = {
    score: { A: 8, B: 8 },
    targetPoints: StrilaMeta.defaultTargetPoints,
    coloredBallsOnTable: [7],
    cueBallSerialPots: null,
    foulOffender: null,
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
  expect(deriveStrilaControlView(state).details.commandSections.tertiary.A.map((entry) => entry.commandType)).toEqual([])

  const step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
    commandType: 'pot.record',
    command: { seat: 'A', pottedBalls: [7] },
  })
  expect(step.protocolEntries).toEqual([
    { source: 'player', command: { type: 'pot.record', seat: 'A', pottedBalls: [7] } },
    {
      source: 'system',
      systemType: 'winner-determined',
      winner: 'A',
      reason: 'respotted-black-won',
    },
  ])
  const next = StrilaFrameStateSchema.parse(step.state)
  expect(deriveStrilaControlView(next).details.commandSections.primary.A.map((entry) => entry.commandType)).toEqual([
    'pot.record',
    'frame.award',
  ])
  expect(deriveStrilaScoreboardView(next).details.winner).toBe('A')
})

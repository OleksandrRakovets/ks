import { expect, test } from 'bun:test'

import { applyGameCommand, createInitialGameState, deriveGameControl, deriveGameScoreboard } from '../../gameplay'
import { type StrilaFrameState, StrilaMeta } from '../definitions'

function controlDetails(state: StrilaFrameState) {
  return deriveGameControl('strila-v2', state).details
}

test('simulation: game api: basic frame 1', () => {
  const initialState = createInitialGameState('strila-v2', {
    targetPointsBySeat: StrilaMeta.defaultTargetPoints,
    breakerSeat: 'A',
  })
  let step = applyGameCommand({
    gameKey: 'strila-v2',
    state: initialState,
    commandType: 'frame.commence',
    command: { seat: 'A' },
  })
  let control = controlDetails(step.state)
  expect([
    ...control.commandSections.primary.A.map((entry) => `${entry.commandType}:${entry.command.seat}`),
    ...control.commandSections.primary.B.map((entry) => `${entry.commandType}:${entry.command.seat}`),
    ...control.commandSections.secondary.A.map((entry) => `${entry.commandType}:${entry.command.seat}`),
    ...control.commandSections.secondary.B.map((entry) => `${entry.commandType}:${entry.command.seat}`),
    ...control.commandSections.tertiary.A.map((entry) => `${entry.commandType}:${entry.command.seat}`),
    ...control.commandSections.tertiary.B.map((entry) => `${entry.commandType}:${entry.command.seat}`),
  ]).toEqual(['pot.record:A', 'pot.record:B', 'foul.commit:A', 'foul.commit:B'])

  step = applyGameCommand({
    gameKey: 'strila-v2',
    state: step.state,
    commandType: 'pot.record',
    command: { seat: 'A', pottedBalls: [1] },
  })
  expect(step.protocolEntries).toEqual([
    {
      source: 'player',
      entryType: 'player-command',
      seat: 'A',
      scoreAfter: { A: 2, B: 0 },
      body: { commandType: 'pot.record', pottedBalls: [1] },
    },
  ])
  expect(deriveGameScoreboard('strila-v2', step.state).details.objectBalls).toEqual([2, 3])

  step = applyGameCommand({ gameKey: 'strila-v2', state: step.state, commandType: 'foul.commit', command: { seat: 'A' } })
  control = controlDetails(step.state)
  expect(control.commandSections.secondary.B.map((entry) => entry.command.choice)).toEqual([
    'play-from-position',
    'pass-position',
    'ball-in-hand',
  ])
  step = applyGameCommand({
    gameKey: 'strila-v2',
    state: step.state,
    commandType: 'penalty.select',
    command: { seat: 'B', choice: 'ball-in-hand' },
  })
  control = controlDetails(step.state)
  expect([
    ...control.commandSections.primary.B.map((entry) => `${entry.commandType}:${entry.command.seat}`),
    ...control.commandSections.secondary.B.map((entry) => `${entry.commandType}:${entry.command.seat}`),
    ...control.commandSections.tertiary.B.map((entry) => `${entry.commandType}:${entry.command.seat}`),
    ...control.commandSections.tertiary.A.map((entry) => `${entry.commandType}:${entry.command.seat}`),
  ]).toEqual(['pot.record:B', 'miss.record:B', 'foul.commit:B'])
})

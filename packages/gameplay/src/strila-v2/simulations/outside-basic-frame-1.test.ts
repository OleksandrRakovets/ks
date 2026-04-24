import { expect, test } from 'bun:test'

import { applyGameCommand, createInitialGameState } from '../../index'
import { StrilaFrameStateSchema, type StrilaFrameState } from '../definitions'
import { deriveStrilaControlView } from '../projections/control'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'

function parseState(state: unknown): StrilaFrameState {
  return StrilaFrameStateSchema.parse(state)
}

test('simulation: outside: basic frame 1', () => {
  let state = parseState(createInitialGameState('strila-v2', { targetPointsBySeat: { A: 9, B: 9 } }))
  let control = deriveStrilaControlView(state).details
  expect(control.commandSections.primary.A.map((entry) => entry.commandType)).toEqual(['frame.commence'])
  expect(control.commandSections.primary.B.map((entry) => entry.commandType)).toEqual(['frame.commence'])

  let step = applyGameCommand({ gameKey: 'strila-v2', state, commandType: 'frame.commence', command: { actor: 'A' } })
  expect(step.protocolEntries).toEqual([{ source: 'player', command: { type: 'frame.commence', actor: 'A' } }])
  control = deriveStrilaControlView(parseState(step.state)).details
  expect([
    ...control.commandSections.primary.A.map((entry) => `${entry.commandType}:${entry.command.actor}`),
    ...control.commandSections.primary.B.map((entry) => `${entry.commandType}:${entry.command.actor}`),
    ...control.commandSections.secondary.A.map((entry) => `${entry.commandType}:${entry.command.actor}`),
    ...control.commandSections.secondary.B.map((entry) => `${entry.commandType}:${entry.command.actor}`),
    ...control.commandSections.tertiary.A.map((entry) => `${entry.commandType}:${entry.command.actor}`),
    ...control.commandSections.tertiary.B.map((entry) => `${entry.commandType}:${entry.command.actor}`),
  ]).toEqual(['pot.record:A', 'pot.record:B', 'foul.commit:A', 'foul.commit:B', 'frame.concede:A', 'frame.concede:B'])
  state = parseState(step.state)

  step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
    commandType: 'pot.record',
    command: { actor: 'A', pottedBalls: [1] },
  })
  expect(step.protocolEntries).toEqual([{ source: 'player', command: { type: 'pot.record', actor: 'A', pottedBalls: [1] } }])
  expect(deriveStrilaScoreboardView(parseState(step.state)).details.objectBalls).toEqual([2, 3])
  state = parseState(step.state)

  step = applyGameCommand({ gameKey: 'strila-v2', state, commandType: 'foul.commit', command: { actor: 'A' } })
  control = deriveStrilaControlView(parseState(step.state)).details
  expect(control.commandSections.secondary.B.map((entry) => entry.label)).toEqual([
    'Play from position',
    'Pass position',
    'Ball in hand',
  ])
  state = parseState(step.state)

  step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
    commandType: 'penalty.select',
    command: { actor: 'B', choice: 'ball-in-hand' },
  })
  control = deriveStrilaControlView(parseState(step.state)).details
  expect([
    ...control.commandSections.primary.B.map((entry) => `${entry.commandType}:${entry.command.actor}`),
    ...control.commandSections.secondary.B.map((entry) => `${entry.commandType}:${entry.command.actor}`),
    ...control.commandSections.tertiary.B.map((entry) => `${entry.commandType}:${entry.command.actor}`),
    ...control.commandSections.tertiary.A.map((entry) => `${entry.commandType}:${entry.command.actor}`),
  ]).toEqual(['pot.record:B', 'miss.record:B', 'foul.commit:B', 'frame.concede:B', 'frame.concede:A'])
})

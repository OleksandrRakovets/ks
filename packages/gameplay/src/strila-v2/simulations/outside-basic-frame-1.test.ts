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
  expect(deriveStrilaControlView(state).availableCommands).toEqual([
    { commandType: 'frame.commence', command: { actor: 'A' }, label: 'Break-off', prominence: 'primary' },
    { commandType: 'frame.commence', command: { actor: 'B' }, label: 'Break-off', prominence: 'primary' },
  ])

  let step = applyGameCommand({ gameKey: 'strila-v2', state, commandType: 'frame.commence', command: { actor: 'A' } })
  expect(step.protocolEntries).toEqual([{ source: 'player', command: { type: 'frame.commence', actor: 'A' } }])
  expect(
    deriveStrilaControlView(parseState(step.state)).availableCommands.map(
      (entry) => `${entry.commandType}:${(entry.command as { actor: string }).actor}`,
    ),
  ).toEqual([
    'pot.record:A',
    'pot.record:B',
    'foul.commit:A',
    'foul.commit:B',
    'frame.concede:A',
    'frame.concede:B',
  ])
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
  expect(deriveStrilaControlView(parseState(step.state)).availableCommands).toEqual([
    {
      commandType: 'penalty.select',
      command: { actor: 'B', choice: 'play-from-position' },
      label: 'Play from position',
      prominence: 'secondary',
      effectSummary: '+1 point',
    },
    {
      commandType: 'penalty.select',
      command: { actor: 'B', choice: 'pass-position' },
      label: 'Pass position',
      prominence: 'secondary',
      effectSummary: '+1 point',
    },
    {
      commandType: 'penalty.select',
      command: { actor: 'B', choice: 'ball-in-hand' },
      label: 'Ball in hand',
      prominence: 'secondary',
      effectSummary: 'No points awarded',
    },
  ])
  expect(deriveStrilaControlView(parseState(step.state)).availableCommands.map((entry) => entry.commandType)).toEqual([
    'penalty.select',
    'penalty.select',
    'penalty.select',
  ])
  state = parseState(step.state)

  step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
    commandType: 'penalty.select',
    command: { actor: 'B', choice: 'ball-in-hand' },
  })
  expect(
    deriveStrilaControlView(parseState(step.state)).availableCommands.map(
      (entry) => `${entry.commandType}:${(entry.command as { actor: string }).actor}`,
    ),
  ).toEqual([
    'pot.record:B',
    'miss.record:B',
    'foul.commit:B',
    'frame.concede:B',
    'frame.concede:A',
  ])
})

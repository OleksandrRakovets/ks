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
    { commandType: 'break-off', command: { actor: 'A' }, label: 'Break-off (A)' },
    { commandType: 'break-off', command: { actor: 'B' }, label: 'Break-off (B)' },
  ])

  let step = applyGameCommand({ gameKey: 'strila-v2', state, commandType: 'break-off', command: { actor: 'A' } })
  expect(step.protocolEntries).toEqual([{ source: 'player', command: { type: 'break-off', actor: 'A' } }])
  expect(deriveStrilaControlView(parseState(step.state)).availableCommands.map((entry) => entry.commandType)).toEqual([
    'record-pot',
    'foul-committed',
    'concede-frame',
  ])
  state = parseState(step.state)

  step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
    commandType: 'record-pot',
    command: { actor: 'A', pottedBalls: [1] },
  })
  expect(step.protocolEntries).toEqual([{ source: 'player', command: { type: 'record-pot', actor: 'A', pottedBalls: [1] } }])
  expect(deriveStrilaScoreboardView(parseState(step.state)).details.objectBalls).toEqual([2, 3])
  state = parseState(step.state)

  step = applyGameCommand({ gameKey: 'strila-v2', state, commandType: 'foul-committed', command: { actor: 'A' } })
  expect(deriveStrilaControlView(parseState(step.state)).availableCommands).toEqual([
    {
      commandType: 'choose-foul-response',
      command: { actor: 'B', choice: 'play-from-position' },
      label: 'Play from position',
      effectSummary: '+1 point',
    },
    {
      commandType: 'choose-foul-response',
      command: { actor: 'B', choice: 'pass-position' },
      label: 'Pass position',
      effectSummary: '+1 point',
    },
    {
      commandType: 'choose-foul-response',
      command: { actor: 'B', choice: 'ball-in-hand' },
      label: 'Ball in hand',
    },
    {
      commandType: 'concede-frame',
      command: { actor: 'B' },
      label: 'Concede frame',
    },
  ])
  expect(deriveStrilaControlView(parseState(step.state)).availableCommands.map((entry) => entry.commandType)).toEqual([
    'choose-foul-response',
    'choose-foul-response',
    'choose-foul-response',
    'concede-frame',
  ])
  state = parseState(step.state)

  step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
    commandType: 'choose-foul-response',
    command: { actor: 'B', choice: 'ball-in-hand' },
  })
  expect(deriveStrilaControlView(parseState(step.state)).availableCommands.map((entry) => entry.commandType)).toEqual([
    'record-pot',
    'record-miss',
    'foul-committed',
    'concede-frame',
  ])
})

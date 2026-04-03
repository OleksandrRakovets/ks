import { expect, test } from 'bun:test'

import { applyAction, createInitialState, parseState } from '../interface'
import { deriveStrilaControlView } from '../projections/control'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'

test('simulation: outside: basic frame 1', () => {
  let state = createInitialState()
  let snapshot = parseState(state)
  expect(deriveStrilaControlView(snapshot).availableActions.map((entry) => entry.id)).toEqual(['break-off'])

  let step = applyAction(state, { action: 'break-off', actor: 'A' })
  expect(step.actionRequest).toEqual({ action: 'break-off', actor: 'A' })
  expect(deriveStrilaControlView(step.state).availableActions.map((entry) => entry.id)).toEqual([
    'record-pot',
    'foul-committed',
    'concede-frame',
  ])
  state = step.state

  step = applyAction(state, { action: 'record-pot', actor: 'A', pottedBalls: [1] })
  expect(step.actionRequest).toEqual({ action: 'record-pot', actor: 'A', pottedBalls: [1] })
  expect(step.protocolEntries).toEqual([
    { source: 'player', command: { type: 'record-pot', actor: 'A', pottedBalls: [1] } },
  ])
  expect(deriveStrilaScoreboardView(step.state).objectBalls).toEqual([2, 3])
  state = step.state

  step = applyAction(state, { action: 'foul-committed', actor: 'A' })
  expect(step.actionRequest).toEqual({ action: 'foul-committed', actor: 'A' })
  expect(deriveStrilaControlView(step.state).availableActions.map((entry) => entry.id)).toEqual([
    'choose-play-from-position',
    'choose-pass-position',
    'choose-ball-in-hand',
    'concede-frame',
  ])
  state = step.state

  step = applyAction(state, { action: 'choose-ball-in-hand', actor: 'B' })
  expect(step.actionRequest).toEqual({ action: 'choose-ball-in-hand', actor: 'B' })
  expect(deriveStrilaControlView(step.state).availableActions.map((entry) => entry.id)).toEqual([
    'record-pot',
    'record-miss',
    'foul-committed',
    'concede-frame',
  ])
})

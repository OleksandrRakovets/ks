import { expect, test } from 'bun:test'

import { type StrilaFrameState } from '../definitions'
import { applyAction, parseState } from '../interface'
import { deriveStrilaControlView } from '../projections/control'
import { deriveStrilaScoreboardView } from '../projections/scoreboard'

test('simulation: outside: respotted black frame 1', () => {
  let state: StrilaFrameState = {
    score: { A: 8, B: 8 },
    coloredBallsOnTable: [7],
    phase: { type: 'respotted-black-opening', actor: 'A' },
  }

  const initial = parseState(state)
  expect(deriveStrilaScoreboardView(initial).objectBalls).toEqual([7])
  expect(deriveStrilaControlView(initial).availableActions.map((entry) => entry.id)).toEqual([
    'record-pot',
    'record-miss',
    'foul-committed',
    'concede-frame',
  ])

  const step = applyAction(state, { action: 'record-pot', actor: 'A', pottedBalls: [7] })
  expect(step.actionRequest).toEqual({ action: 'record-pot', actor: 'A', pottedBalls: [7] })
  expect(step.protocolEntries).toEqual([
    { source: 'player', command: { type: 'record-pot', actor: 'A', pottedBalls: [7] } },
    {
      source: 'system',
      systemType: 'winner-determined',
      winner: 'A',
      reason: 'respotted-black-won',
    },
  ])
  expect(deriveStrilaControlView(step.state).availableActions.map((entry) => entry.id)).toEqual(['record-pot', 'award-frame', 'concede-frame'])
  expect(deriveStrilaScoreboardView(step.state).winner).toBe('A')
})

import { expect, test } from 'bun:test'

import * as v from 'valibot'

import { applyGameCommand, createInitialGameState, deriveGameProjection } from '../../gameplay'
import {
  StrilaControlViewSchema,
  StrilaFrameStateSchema,
  StrilaMeta,
  StrilaScoreboardViewSchema,
  type StrilaFrameState,
} from '../definitions'

function parseState(state: unknown): StrilaFrameState {
  return v.parse(StrilaFrameStateSchema, state)
}

function controlDetails(state: unknown) {
  return v.parse(StrilaControlViewSchema, deriveGameProjection({ gameKey: 'strila-v2', state, projection: 'control' })).details
}

function scoreboardDetails(state: unknown) {
  return v.parse(StrilaScoreboardViewSchema, deriveGameProjection({ gameKey: 'strila-v2', state, projection: 'scoreboard' }))
    .details
}

test('simulation: game api: basic frame 1', () => {
  let state = parseState(
    createInitialGameState('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' }),
  )
  let step = applyGameCommand({ gameKey: 'strila-v2', state, commandType: 'frame.commence', command: { seat: 'A' } })
  state = parseState(step.state)
  let control = controlDetails(state)
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
    state,
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
  expect(scoreboardDetails(step.state).objectBalls).toEqual([2, 3])
  state = parseState(step.state)

  step = applyGameCommand({ gameKey: 'strila-v2', state, commandType: 'foul.commit', command: { seat: 'A' } })
  control = controlDetails(step.state)
  expect(control.commandSections.secondary.B.map((entry) => entry.command.choice)).toEqual([
    'play-from-position',
    'pass-position',
    'ball-in-hand',
  ])
  state = parseState(step.state)

  step = applyGameCommand({
    gameKey: 'strila-v2',
    state,
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

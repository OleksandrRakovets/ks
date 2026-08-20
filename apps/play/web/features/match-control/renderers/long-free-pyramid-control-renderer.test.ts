import { expect, test } from 'bun:test'

import type { ControlCommandPreset } from '@ks/core'

import { labelLongFreePyramidCommands } from './long-free-pyramid-control-renderer'

test('winner-determined pot keeps its one-point label and original command', () => {
  const frameAward: ControlCommandPreset = {
    source: 'game',
    commandType: 'frame.award',
    command: { seat: 'A' },
    seat: 'A',
    prominence: 'primary',
  }
  const onePointPot: ControlCommandPreset = {
    source: 'game',
    commandType: 'pot.record',
    command: { seat: 'A', points: 1 },
    seat: 'A',
    prominence: 'secondary',
  }

  const labelled = labelLongFreePyramidCommands([frameAward, onePointPot])
  expect(labelled).toEqual([
    { kind: 'command', command: frameAward },
    { kind: 'points', command: onePointPot, points: 1 },
  ])
  expect(labelled[1]?.command).toBe(onePointPot)
})

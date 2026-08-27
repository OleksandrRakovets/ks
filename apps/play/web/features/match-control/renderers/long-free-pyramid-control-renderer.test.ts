import { expect, test } from 'bun:test'

import type { Control } from '@ks/core'

import { labelLongFreePyramidCommands } from './long-free-pyramid-control-renderer'

test('winner-determined pot keeps its one-point label and original command', () => {
  const frameAward: Control = {
    source: 'game',
    type: 'frame.award',
    fixedInput: {},
    seat: 'A',
    prominence: 'primary',
  }
  const oneBallPot: Control = {
    source: 'game',
    type: 'pot.record',
    fixedInput: { pottedBallCount: 1 },
    seat: 'A',
    prominence: 'secondary',
  }

  const labelled = labelLongFreePyramidCommands([frameAward, oneBallPot])
  expect(labelled).toEqual([
    { kind: 'command', command: frameAward },
    { kind: 'pottedBallCount', command: oneBallPot, pottedBallCount: 1 },
  ])
  expect(labelled[1]?.command).toBe(oneBallPot)
})

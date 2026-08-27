import { expect, test } from 'bun:test'

import { createInitialSnapshot, sendEvent } from '../machine'
import { PyramidRuleSpecificsByGameKey } from '../rules'
import { derivePyramidControlView } from './control'

test('projects exact combined-pyramid open-play presentation and control sections', () => {
  const rules = PyramidRuleSpecificsByGameKey['combined-pyramid']
  const snapshot = sendEvent(createInitialSnapshot(rules, { A: 8, B: 8 }), {
    type: 'frame.commence',
    seat: 'A',
  })

  expect(derivePyramidControlView(snapshot, rules)).toEqual({
    gameKey: 'combined-pyramid',
    projection: 'control',
    score: { A: 0, B: 0 },
    details: {
      phase: 'open-play',
      situationTitle: 'Open play',
      situationSummary: 'Record shot value or foul for either player.',
      winner: undefined,
      isPotCommandAvailable: true,
      controlSections: {
        primary: {
          A: [
            {
              source: 'game',
              type: 'pot.record',
              fixedInput: { pottedBallCount: 1 },
              seat: 'A',
              prominence: 'primary',
            },
          ],
          B: [
            {
              source: 'game',
              type: 'pot.record',
              fixedInput: { pottedBallCount: 1 },
              seat: 'B',
              prominence: 'primary',
            },
          ],
        },
        secondary: {
          A: [
            {
              source: 'game',
              type: 'pot.record',
              fixedInput: { pottedBallCount: 2 },
              seat: 'A',
              prominence: 'secondary',
            },
            {
              source: 'game',
              type: 'foul.commit',
              fixedInput: {},
              seat: 'A',
              prominence: 'secondary',
              effect: 'opponent-plus-one',
            },
          ],
          B: [
            {
              source: 'game',
              type: 'pot.record',
              fixedInput: { pottedBallCount: 2 },
              seat: 'B',
              prominence: 'secondary',
            },
            {
              source: 'game',
              type: 'foul.commit',
              fixedInput: {},
              seat: 'B',
              prominence: 'secondary',
              effect: 'opponent-plus-one',
            },
          ],
        },
        tertiary: { A: [], B: [] },
        neutral: [],
      },
    },
  })
})

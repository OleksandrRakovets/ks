import { expect, test } from 'bun:test'

import { createInitialSnapshot, sendEvent } from '../machine'
import { PyramidRuleSpecificsByGameKey } from '../rules'
import { derivePyramidControlView } from './control'

test('projects exact combined-pyramid open-play presentation and command sections', () => {
  const rules = PyramidRuleSpecificsByGameKey['combined-pyramid']
  const snapshot = sendEvent(createInitialSnapshot(rules, { A: 8, B: 8 }), { type: 'frame.commence', seat: 'A' })

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
      commandSections: {
        primary: {
          A: [
            {
              source: 'game',
              commandType: 'pot.record',
              command: { seat: 'A', pottedBallCount: 1 },
              seat: 'A',
              prominence: 'primary',
            },
          ],
          B: [
            {
              source: 'game',
              commandType: 'pot.record',
              command: { seat: 'B', pottedBallCount: 1 },
              seat: 'B',
              prominence: 'primary',
            },
          ],
        },
        secondary: {
          A: [
            {
              source: 'game',
              commandType: 'pot.record',
              command: { seat: 'A', pottedBallCount: 2 },
              seat: 'A',
              prominence: 'secondary',
            },
            {
              source: 'game',
              commandType: 'foul.commit',
              command: { seat: 'A' },
              seat: 'A',
              prominence: 'secondary',
              effect: 'opponent-plus-one',
            },
          ],
          B: [
            {
              source: 'game',
              commandType: 'pot.record',
              command: { seat: 'B', pottedBallCount: 2 },
              seat: 'B',
              prominence: 'secondary',
            },
            {
              source: 'game',
              commandType: 'foul.commit',
              command: { seat: 'B' },
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

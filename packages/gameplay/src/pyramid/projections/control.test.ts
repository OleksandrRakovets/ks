import { expect, test } from 'bun:test'

import { createInitialSnapshot, sendEvent } from '../machine'
import { PyramidRuleSpecificsByGameKey } from '../rules'
import { derivePyramidControlProjection } from './control'

test('projects exact combined-pyramid open-play presentation and flat controls', () => {
  const rules = PyramidRuleSpecificsByGameKey['combined-pyramid']
  const snapshot = sendEvent(createInitialSnapshot(rules, { A: 8, B: 8 }), {
    type: 'frame.commence',
    seat: 'A',
  })

  const result = derivePyramidControlProjection(snapshot, rules)
  expect(result.game).toEqual({
    gameKey: 'combined-pyramid',
    score: { A: 0, B: 0 },
    details: {
      phase: 'open-play',
      situationTitle: 'Open play',
      situationSummary: 'Record shot value or foul for either player.',
      winner: undefined,
      isPotCommandAvailable: true,
    },
  })
  expect(result.controls).toHaveLength(6)
  expect(result.controls[0]).toEqual({
    source: 'game',
    type: 'pot.record',
    fixedInput: { pottedBallCount: 1 },
    seat: 'A',
    prominence: 'primary',
  })
})

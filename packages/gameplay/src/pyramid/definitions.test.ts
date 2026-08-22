import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { PyramidContextSchema, PyramidFrameStateSchema } from './definitions'
import { PyramidRuleSpecificsByGameKey, PyramidRulesSchema } from './rules'

describe('Pyramid schemas', () => {
  test('PyramidFrameStateSchema requires nullable winner', () => {
    expect(
      v.parse(PyramidFrameStateSchema, {
        pointsBySeat: { A: 0, B: 0 },
        targetPointsBySeat: { A: 8, B: 8 },
        phase: 'not-started',
        winner: null,
      }).winner,
    ).toBeNull()

    expect(
      v.parse(PyramidFrameStateSchema, {
        pointsBySeat: { A: 8, B: 2 },
        targetPointsBySeat: { A: 8, B: 8 },
        phase: 'winner-determined',
        winner: 'A',
      }).winner,
    ).toBe('A')

    expect(() =>
      v.parse(PyramidFrameStateSchema, {
        pointsBySeat: { A: 0, B: 0 },
        targetPointsBySeat: { A: 8, B: 8 },
        phase: 'not-started',
      }),
    ).toThrow()

    expect(() =>
      v.parse(PyramidFrameStateSchema, {
        pointsBySeat: { A: 8, B: 2 },
        targetPointsBySeat: { A: 8, B: 8 },
        phase: 'winner-determined',
        winnerSeat: 'A',
      }),
    ).toThrow()
  })

  test('PyramidRulesSchema accepts every keyed rules map entry', () => {
    for (const gameKey of ['free-pyramid', 'combined-pyramid', 'combined-pyramid-old'] as const) {
      expect(v.parse(PyramidRulesSchema, PyramidRuleSpecificsByGameKey[gameKey])).toEqual(
        PyramidRuleSpecificsByGameKey[gameKey],
      )
    }
  })

  test('PyramidContextSchema parses machine context with keyed rules', () => {
    expect(
      v.parse(PyramidContextSchema, {
        score: { A: 2, B: 0 },
        targetPoints: { A: 8, B: 8 },
        rules: PyramidRuleSpecificsByGameKey['free-pyramid'],
        winner: null,
      }),
    ).toEqual({
      score: { A: 2, B: 0 },
      targetPoints: { A: 8, B: 8 },
      rules: PyramidRuleSpecificsByGameKey['free-pyramid'],
      winner: null,
    })
  })
})

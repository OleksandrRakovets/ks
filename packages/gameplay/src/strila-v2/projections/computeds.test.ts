import { describe, expect, test } from 'bun:test'

import type { StrilaColoredBall } from '../definitions'
import { computeStrilaObjectBalls, computeStrilaPointsAvailable } from './computeds'

type PointsCombo = {
  balls: StrilaColoredBall[]
  points: number
}

describe('computed: points available', () => {
  test('returns remaining points by colored balls on table', () => {
    const combos: PointsCombo[] = [
      { balls: [1, 2, 3, 4, 5, 6, 7], points: 14 },
      { balls: [2, 3, 4, 5, 6, 7], points: 12 },
      { balls: [3, 4, 5, 6, 7], points: 10 },
      { balls: [4, 5, 6, 7], points: 8 },
      { balls: [5, 6, 7], points: 6 },
      { balls: [6, 7], points: 4 },
      { balls: [7], points: 2 },
      { balls: [6], points: 2 },
      { balls: [5], points: 2 },
      { balls: [4], points: 2 },
      { balls: [3], points: 2 },
      { balls: [2], points: 2 },
      { balls: [1], points: 2 },
    ]

    combos.forEach(({ balls, points }) => {
      expect(computeStrilaPointsAvailable([...balls])).toBe(points)
    })
  })
})

describe('computed: object balls', () => {
  test('with all balls on table -> lowest two', () => {
    expect(computeStrilaObjectBalls([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2])
  })

  test('after low balls are gone -> next two lowest', () => {
    expect(computeStrilaObjectBalls([3, 4, 5, 6, 7])).toEqual([3, 4])
  })

  test('with two balls left -> only the lower one', () => {
    expect(computeStrilaObjectBalls([6, 7])).toEqual([6])
  })

  test('with one ball left -> that last ball', () => {
    expect(computeStrilaObjectBalls([5])).toEqual([5])
    expect(computeStrilaObjectBalls([7])).toEqual([7])
  })

  test('supports realistic non-consecutive late-frame states', () => {
    expect(computeStrilaObjectBalls([4, 6])).toEqual([4])
    expect(computeStrilaObjectBalls([4, 6, 7])).toEqual([4, 6])
  })
})

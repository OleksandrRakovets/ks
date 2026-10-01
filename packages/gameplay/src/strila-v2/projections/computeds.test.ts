import { describe, expect, test } from 'bun:test'

import { computeStrilaObjectBalls } from './computeds'

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

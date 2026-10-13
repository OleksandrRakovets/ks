import { expect, test } from 'bun:test'

import type { StrilaColoredBall } from '../definitions'
import { computeStrilaObjectBalls } from './computeds'

test.each<[string, StrilaColoredBall[], StrilaColoredBall[]]>([
  ['all balls on table -> lowest two', [1, 2, 3, 4, 5, 6, 7], [1, 2]],
  ['low balls gone -> next two lowest', [3, 4, 5, 6, 7], [3, 4]],
  ['two balls left -> only the lower one', [6, 7], [6]],
  ['one ball left -> that last ball', [5], [5]],
  ['only the black left -> the black', [7], [7]],
  ['non-consecutive pair -> only the lower one', [4, 6], [4]],
  ['non-consecutive three -> lowest two', [4, 6, 7], [4, 6]],
])('object balls with %s', (_name, onTable, expected) => {
  expect(computeStrilaObjectBalls(onTable)).toEqual(expected)
})

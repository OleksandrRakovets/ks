import { describe, expect, test } from 'bun:test'

import { createInitialState, parseState, translateActionToCommand } from './interface'
import { createEmptyStrilaFrameState } from './reducer'

describe('interface', () => {
  test('maps foul response action to reducer command', () => {
    expect(translateActionToCommand({ action: 'choose-ball-in-hand', actor: 'B' })).toEqual({
      type: 'choose-foul-response',
      actor: 'B',
      choice: 'ball-in-hand',
    })
  })

  test('rejects duplicate potted balls when translating action', () => {
    expect(() =>
      translateActionToCommand({ action: 'record-pot', actor: 'A', pottedBalls: [7, 7] }),
    ).toThrow('Duplicate potted ball: 7')
  })

  test('parses stored state', () => {
    expect(parseState(createEmptyStrilaFrameState())).toEqual(createEmptyStrilaFrameState())
  })

  test('creates initial state for new match', () => {
    expect(createInitialState()).toEqual(createEmptyStrilaFrameState())
  })
})

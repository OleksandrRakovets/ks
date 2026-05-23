import { describe, expect, test } from 'bun:test'

import { canUndoStrilaRecord, replayStrilaRecord } from './replay'
import { type StrilaControllerEntry, undoLastPlayerCommand } from './undo-controller'

describe('replay undo', () => {
  test('can undo two mistaken shots one by one', () => {
    let recorded: StrilaControllerEntry[] = [
      { type: 'frame.commence', seat: 'A' },
      { type: 'pot.record', seat: 'A', pottedBalls: [1] },
      { type: 'pot.record', seat: 'B', pottedBalls: [2] },
      { type: 'pot.record', seat: 'B', pottedBalls: [3] },
    ]

    expect(replayStrilaRecord(recorded).state.score).toEqual({ A: 2, B: 4 })
    expect(canUndoStrilaRecord(recorded)).toBe(true)

    const firstUndo = undoLastPlayerCommand(recorded, 'A')
    expect(firstUndo.ok).toBe(true)
    if (!firstUndo.ok) throw new Error('expected successful undo')
    recorded = firstUndo.controllerEntries
    expect(firstUndo.undoneCommandType).toBe('pot.record')
    expect(firstUndo.controllerCommand).toEqual({ type: 'undo-last-player-command', seat: 'A' })
    expect(firstUndo.controllerEvents).toEqual([{ type: 'undo-applied', undoneCommandType: 'pot.record' }])
    expect(firstUndo.state.score).toEqual({ A: 2, B: 2 })

    const secondUndo = undoLastPlayerCommand(recorded, 'A')
    expect(secondUndo.ok).toBe(true)
    if (!secondUndo.ok) throw new Error('expected successful undo')
    expect(secondUndo.state.score).toEqual({ A: 2, B: 0 })
    expect(secondUndo.state.coloredBallsOnTable).toEqual([2, 3, 4, 5, 6, 7])
  })

  test('cannot undo after frame was awarded', () => {
    const recorded: StrilaControllerEntry[] = [
      { type: 'frame.commence', seat: 'A' },
      { type: 'pot.record', seat: 'A', pottedBalls: [1, 2, 3, 4, 5] },
      { type: 'frame.award', seat: 'A' },
    ]

    const state = replayStrilaRecord(recorded).state
    expect(state.phase).toBe('frame-over')
    expect(state.winner).toBe('A')
    expect(canUndoStrilaRecord(recorded)).toBe(false)
    expect(undoLastPlayerCommand(recorded, 'A')).toEqual({ ok: false, reason: 'frame-already-awarded' })
  })
})

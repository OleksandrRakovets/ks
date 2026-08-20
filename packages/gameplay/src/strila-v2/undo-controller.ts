import { type Seat, SeatSchema } from '@ks/core'
import * as v from 'valibot'

import { StrilaCommandSchema } from './definitions'
import { replayStrilaRecord } from './replay'

export const StrilaUndoCommandSchema = v.object({
  type: v.literal('undo-last-player-command'),
  seat: SeatSchema,
})
type StrilaUndoCommand = v.InferOutput<typeof StrilaUndoCommandSchema>

export const StrilaUndoableCommandTypeSchema = v.picklist([
  'frame.commence',
  'pot.record',
  'miss.record',
  'foul.commit',
  'penalty.select',
  'frame.award',
])
type StrilaUndoableCommandType = v.InferOutput<typeof StrilaUndoableCommandTypeSchema>

export const StrilaControllerEntrySchema = v.union([StrilaCommandSchema, StrilaUndoCommandSchema])
export type StrilaControllerEntry = v.InferOutput<typeof StrilaControllerEntrySchema>

type StrilaControllerEvent = {
  type: 'undo-applied'
  undoneCommandType: StrilaUndoableCommandType
}

export type StrilaUndoResult =
  | {
      ok: true
      controllerEntries: StrilaControllerEntry[]
      state: ReturnType<typeof replayStrilaRecord>['state']
      controllerCommand: StrilaUndoCommand
      controllerEvents: StrilaControllerEvent[]
      undoneCommandType: StrilaUndoableCommandType
    }
  | {
      ok: false
      reason: 'nothing-to-undo' | 'frame-already-awarded'
    }

export function undoLastPlayerCommand(controllerEntries: StrilaControllerEntry[], seat: Seat): StrilaUndoResult {
  const before = replayStrilaRecord(controllerEntries)

  if (before.state.phase === 'frame-over') {
    return { ok: false, reason: 'frame-already-awarded' }
  }

  const undone = before.applied.at(-1)?.command
  if (!undone) {
    return { ok: false, reason: 'nothing-to-undo' }
  }

  const controllerCommand: StrilaUndoCommand = { type: 'undo-last-player-command', seat }
  const nextControllerEntries = [...controllerEntries, controllerCommand]
  const after = replayStrilaRecord(nextControllerEntries)

  return {
    ok: true,
    controllerEntries: nextControllerEntries,
    state: after.state,
    controllerCommand,
    controllerEvents: [{ type: 'undo-applied', undoneCommandType: undone.type }],
    undoneCommandType: undone.type,
  }
}

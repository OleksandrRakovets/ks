import { z } from 'zod'

import { StrilaCommandSchema, StrilaSeatSchema, type StrilaSeat } from './definitions'
import { replayStrilaRecord } from './replay'

export const StrilaUndoCommandSchema = z.object({
  type: z.literal('undo-last-player-command'),
  actor: StrilaSeatSchema,
})
export type StrilaUndoCommand = z.infer<typeof StrilaUndoCommandSchema>

export const StrilaUndoableCommandTypeSchema = z.enum([
  'frame.commence',
  'pot.record',
  'miss.record',
  'foul.commit',
  'penalty.select',
  'frame.award',
  'frame.concede',
])
export type StrilaUndoableCommandType = z.infer<typeof StrilaUndoableCommandTypeSchema>

export const StrilaControllerEntrySchema = z.union([StrilaCommandSchema, StrilaUndoCommandSchema])
export type StrilaControllerEntry = z.infer<typeof StrilaControllerEntrySchema>

export type StrilaControllerEvent = {
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

export function undoLastPlayerCommand(controllerEntries: StrilaControllerEntry[], actor: StrilaSeat): StrilaUndoResult {
  const before = replayStrilaRecord(controllerEntries)

  if (before.state.phase.type === 'frame-over') {
    return { ok: false, reason: 'frame-already-awarded' }
  }

  const undone = before.applied.at(-1)?.command
  if (!undone) {
    return { ok: false, reason: 'nothing-to-undo' }
  }

  const controllerCommand: StrilaUndoCommand = { type: 'undo-last-player-command', actor }
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

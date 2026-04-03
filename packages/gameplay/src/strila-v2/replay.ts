import { type StrilaCommand, type StrilaFrameState } from './definitions'
import { createEmptyStrilaFrameState, reduceStrilaCommand } from './reducer'
import { type StrilaControllerEntry } from './undo-controller'

type AppliedCommand = {
  command: StrilaCommand
  stateAfter: StrilaFrameState
}

function isFinalState(state: StrilaFrameState): boolean {
  return state.phase.type === 'frame-over'
}

function getEffectiveCommands(recordedCommands: StrilaControllerEntry[]): StrilaCommand[] {
  const effective: StrilaCommand[] = []

  for (const command of recordedCommands) {
    if (command.type === 'undo-last-player-command') {
      effective.pop()
      continue
    }
    effective.push(command)
  }

  return effective
}

function replayEffectiveCommands(commands: StrilaCommand[]): { state: StrilaFrameState; applied: AppliedCommand[] } {
  let state = createEmptyStrilaFrameState()
  const applied: AppliedCommand[] = []

  for (const command of commands) {
    state = reduceStrilaCommand(state, command)
    applied.push({ command, stateAfter: state })
  }

  return { state, applied }
}

export function replayStrilaRecord(recordedCommands: StrilaControllerEntry[]) {
  const effective = getEffectiveCommands(recordedCommands)
  return replayEffectiveCommands(effective)
}

export function canUndoStrilaRecord(recordedCommands: StrilaControllerEntry[]): boolean {
  const { state, applied } = replayStrilaRecord(recordedCommands)
  if (isFinalState(state)) return false
  return applied.length > 0
}

import { type StrilaCommand, type StrilaFrameState } from './definitions'
import { StrilaGameplayRuntime } from './runtime'
import { type StrilaControllerEntry } from './undo-controller'

const runtime = new StrilaGameplayRuntime()

type AppliedCommand = {
  command: StrilaCommand
  stateAfter: StrilaFrameState
}

function isFinalState(state: StrilaFrameState): boolean {
  return state.phase === 'frame-over'
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
  let state = runtime.createInitialState({ targetPointsBySeat: { A: 9, B: 9 } })
  const applied: AppliedCommand[] = []

  for (const command of commands) {
    state = runtime.applyCommand({ state, commandType: command.type, command }).state as StrilaFrameState
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

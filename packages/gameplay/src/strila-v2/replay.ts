import { applyGameCommand, createInitialGameState } from '../gameplay'
import { type StrilaCommand, type StrilaFrameState, StrilaMeta } from './definitions'
import { type StrilaControllerEntry } from './undo-controller'

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

function replayEffectiveCommands(commands: StrilaCommand[]) {
  let state = createInitialGameState('strila-v2', { targetPointsBySeat: StrilaMeta.defaultTargetPoints, breakerSeat: 'A' })
  state = applyGameCommand({ gameKey: 'strila-v2', state, commandType: 'frame.commence', command: { seat: 'A' } }).state
  const applied: AppliedCommand[] = []

  for (const command of commands) {
    const { type: commandType, ...payload } = command
    state = applyGameCommand({ gameKey: 'strila-v2', state, commandType, command: payload }).state
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

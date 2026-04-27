import type { StrilaFrameState, StrilaCommand } from '../definitions'
import { projectStrilaProtocolEntries } from '../protocol'
import { StrilaGameplayRuntime } from '../runtime'

const runtime = new StrilaGameplayRuntime()

export function applyCommand(previous: StrilaFrameState, command: StrilaCommand) {
  const next = runtime.applyCommand({ state: previous, commandType: command.type, command }).state as StrilaFrameState
  const protocolEntries = projectStrilaProtocolEntries({ previous, command, next })
  return { next, protocolEntries }
}

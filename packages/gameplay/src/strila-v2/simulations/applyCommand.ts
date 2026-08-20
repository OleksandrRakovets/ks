import type { StrilaCommand, StrilaFrameState } from '../definitions'
import { projectStrilaProtocolEntries } from '../protocol'
import { StrilaGameplayRuntime } from '../runtime'

const runtime = new StrilaGameplayRuntime()

export function applyCommand(previous: StrilaFrameState, command: StrilaCommand) {
  const { type: commandType, ...payload } = command
  const next = runtime.applyCommand({ state: previous, commandType, command: payload }).state
  const protocolEntries = projectStrilaProtocolEntries({ previous, command, next })
  return { next, protocolEntries }
}

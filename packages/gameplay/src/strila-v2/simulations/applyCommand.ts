import type { StrilaFrameState, StrilaCommand } from '../definitions'
import { projectStrilaProtocolEntries } from '../protocol'
import { reduceStrilaCommand } from '../reducer'

export function applyCommand(previous: StrilaFrameState, command: StrilaCommand) {
  const next = reduceStrilaCommand(previous, command)
  const protocolEntries = projectStrilaProtocolEntries({ previous, command, next })
  return { next, protocolEntries }
}

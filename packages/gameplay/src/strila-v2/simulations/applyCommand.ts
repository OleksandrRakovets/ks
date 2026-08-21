import { createGameplaySession } from '../../session-factory'
import type { StrilaCommand, StrilaFrameState } from '../definitions'
import { createStrilaGameplaySession } from '../session'

export function applyCommand(previous: StrilaFrameState, command: StrilaCommand) {
  const session = createStrilaGameplaySession({ targetPointsBySeat: previous.targetPoints, breakerSeat: 'A' }, previous)
  try {
    const { type: commandType, ...payload } = command
    const decision = session.decide(commandType, payload)
    if (decision._tag !== 'accepted') throw new Error(`Expected accepted command ${command.type}`)
    const result = session.applyCommitted(decision.transition)
    return { next: result.state, protocolEntries: result.protocolEntries }
  } finally {
    session.dispose()
  }
}

export function createWarmStrilaSession(args: {
  targetPointsBySeat: StrilaFrameState['targetPoints']
  breakerSeat: 'A' | 'B'
}) {
  return createGameplaySession('strila-v2', args)
}

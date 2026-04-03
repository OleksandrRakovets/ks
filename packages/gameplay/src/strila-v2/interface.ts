import { z } from 'zod'

import {
  StrilaBallSchema,
  StrilaCommandSchema,
  StrilaFrameStateSchema,
  StrilaSeatSchema,
  type StrilaCommand,
  type StrilaFrameState,
  type StrilaProtocolEntry,
} from './definitions'
import { projectStrilaProtocolEntries } from './protocol'
import { reduceStrilaCommand } from './reducer'
import { createEmptyStrilaFrameState } from './reducer'

// This is the UI/app-facing control wire. It intentionally differs from the
// reducer command schema so the app can work with phase-local actions without
// needing to know reducer-specific command normalization details.
const ActionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('break-off'), actor: StrilaSeatSchema }),
  z.object({
    action: z.literal('record-pot'),
    actor: StrilaSeatSchema,
    pottedBalls: z.array(StrilaBallSchema).min(1),
  }),
  z.object({ action: z.literal('record-miss'), actor: StrilaSeatSchema }),
  z.object({ action: z.literal('foul-committed'), actor: StrilaSeatSchema }),
  z.object({ action: z.literal('choose-play-from-position'), actor: StrilaSeatSchema }),
  z.object({ action: z.literal('choose-pass-position'), actor: StrilaSeatSchema }),
  z.object({ action: z.literal('choose-ball-in-hand'), actor: StrilaSeatSchema }),
  z.object({ action: z.literal('award-frame'), actor: StrilaSeatSchema }),
  z.object({ action: z.literal('concede-frame'), actor: StrilaSeatSchema }),
])
export type ActionRequest = z.infer<typeof ActionRequestSchema>

export type ActionResult = {
  actionRequest: ActionRequest
  state: StrilaFrameState
  protocolEntries: StrilaProtocolEntry[]
}

export function createInitialState(): StrilaFrameState {
  return createEmptyStrilaFrameState()
}

export function translateActionToCommand(actionRequest: ActionRequest): StrilaCommand {
  switch (actionRequest.action) {
    case 'break-off':
      return StrilaCommandSchema.parse({ type: 'break-off', actor: actionRequest.actor })
    case 'record-pot':
      return StrilaCommandSchema.parse({
        type: 'record-pot',
        actor: actionRequest.actor,
        pottedBalls: actionRequest.pottedBalls,
      })
    case 'record-miss':
      return StrilaCommandSchema.parse({ type: 'record-miss', actor: actionRequest.actor })
    case 'foul-committed':
      return StrilaCommandSchema.parse({ type: 'foul-committed', actor: actionRequest.actor })
    case 'choose-play-from-position':
      return StrilaCommandSchema.parse({
        type: 'choose-foul-response',
        actor: actionRequest.actor,
        choice: 'play-from-position',
      })
    case 'choose-pass-position':
      return StrilaCommandSchema.parse({
        type: 'choose-foul-response',
        actor: actionRequest.actor,
        choice: 'pass-position',
      })
    case 'choose-ball-in-hand':
      return StrilaCommandSchema.parse({
        type: 'choose-foul-response',
        actor: actionRequest.actor,
        choice: 'ball-in-hand',
      })
    case 'award-frame':
      return StrilaCommandSchema.parse({ type: 'award-frame', actor: actionRequest.actor })
    case 'concede-frame':
      return StrilaCommandSchema.parse({ type: 'concede-frame', actor: actionRequest.actor })
  }
}

export function parseState(state: StrilaFrameState): StrilaFrameState {
  return StrilaFrameStateSchema.parse(state)
}

export function applyAction(state: StrilaFrameState, actionRequest: ActionRequest): ActionResult {
  const parsedState = StrilaFrameStateSchema.parse(state)
  const parsedActionRequest = ActionRequestSchema.parse(actionRequest)
  const command = translateActionToCommand(parsedActionRequest)
  const nextState = reduceStrilaCommand(parsedState, command)

  return {
    actionRequest: parsedActionRequest,
    state: nextState,
    protocolEntries: projectStrilaProtocolEntries({ previous: parsedState, command, next: nextState }),
  }
}

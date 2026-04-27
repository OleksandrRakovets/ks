import { z } from 'zod'

import { type GameCreateStateArgs, type GameProjectionKey, GameplayRuntime } from '../abstract-runtime'
import {
  StrilaContextSchema,
  StrilaEventSchema,
  StrilaPhases,
  type StrilaContext,
  type StrilaEvent,
  type StrilaPhase,
} from './definitions2'
import {
  createInitialSnapshot,
  getPhase,
  sendEvent,
  strilaSparringMachine,
  type StrilaSparringSnapshot,
} from './machine-sparring'

export const StrilaMachineFrameStateSchema = StrilaContextSchema.extend({
  phase: z.enum(StrilaPhases),
})

export type StrilaMachineFrameState = z.infer<typeof StrilaMachineFrameStateSchema>

type StrilaMachineCommandEnvelope = {
  state: unknown
  commandType: string
  command: unknown
}

function parseStrilaMachineCommand(input: StrilaMachineCommandEnvelope): StrilaEvent {
  if (typeof input.command !== 'object' || input.command === null) {
    return StrilaEventSchema.parse({ type: input.commandType })
  }
  return StrilaEventSchema.parse({ ...(input.command as object), type: input.commandType })
}

function phaseToSnapshotValue(phase: StrilaPhase): StrilaSparringSnapshot['value'] {
  switch (phase) {
    case 'foul-committed.penalty-selection':
      return { 'foul-committed': 'penalty-selection' }
    case 'foul-committed.ball-in-hand':
      return { 'foul-committed': 'ball-in-hand' }
    case 'respotted-black.opening':
      return { 'respotted-black': 'opening' }
    case 'respotted-black.play':
      return { 'respotted-black': 'play' }
    default:
      return phase
  }
}

function serializeSnapshot(snapshot: StrilaSparringSnapshot): StrilaMachineFrameState {
  return StrilaMachineFrameStateSchema.parse({
    ...snapshot.context,
    phase: getPhase(snapshot),
  })
}

function restoreSnapshot(state: StrilaMachineFrameState): StrilaSparringSnapshot {
  const snapshot = createInitialSnapshot(state.targetPointsBySeat)
  const { phase: _phase, ...context } = state
  return strilaSparringMachine.resolveState({
    ...snapshot,
    value: phaseToSnapshotValue(state.phase),
    context: context satisfies StrilaContext,
  })
}

export class StrilaMachineGameplayRuntime extends GameplayRuntime {
  createInitialState(args: GameCreateStateArgs): StrilaMachineFrameState {
    return serializeSnapshot(createInitialSnapshot(args.targetPointsBySeat))
  }

  parseState(state: unknown): StrilaMachineFrameState {
    return StrilaMachineFrameStateSchema.parse(state)
  }

  applyCommand(input: StrilaMachineCommandEnvelope): { state: unknown; protocolEntries?: unknown[] } {
    const previous = this.parseState(input.state)
    const command = parseStrilaMachineCommand(input)
    const next = sendEvent(restoreSnapshot(previous), command)

    return {
      state: serializeSnapshot(next),
    }
  }

  deriveProjection(args: { state: unknown; projection: GameProjectionKey }): unknown {
    const state = this.parseState(args.state)

    switch (args.projection) {
      case 'control':
        return {
          gameKey: 'strila-v2',
          projection: 'control',
          score: state.score,
          details: { phase: state.phase },
        }
      case 'scoreboard':
      case 'summary':
        return {
          gameKey: 'strila-v2',
          projection: args.projection,
          score: state.score,
          details: {
            phase: state.phase,
            winner: state.winner,
            winReason: state.winReason,
            coloredBallsOnTable: state.coloredBallsOnTable,
          },
        }
    }
  }
}

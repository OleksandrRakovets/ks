import { type FrameOutcome } from '@ks/core'
import * as v from 'valibot'

import type { GameplayRuntime, GameCommandResult, GameCreateStateArgs, GameProjectionKey } from '../constants'
import {
  StrilaCommandSchema,
  StrilaFrameStateSchema,
  type StrilaCommand,
  type StrilaContext,
  type StrilaFrameState,
  type StrilaPhase,
} from './definitions'
import {
  createInitialSnapshot,
  getPhase,
  sendEvent,
  strilaSparringMachine,
  type StrilaSparringSnapshot,
} from './machine-sparring'
import { deriveStrilaControlView } from './projections/control'
import { deriveStrilaScoreboardView } from './projections/scoreboard'
import { deriveStrilaSummaryView } from './projections/summary'
import { projectStrilaProtocolEntries } from './protocol'

export { StrilaFrameStateSchema, type StrilaFrameState }

type StrilaCommandEnvelope = {
  state: unknown
  commandType: string
  command: unknown
}

function parseStrilaCommand(input: StrilaCommandEnvelope): StrilaCommand {
  if (typeof input.command !== 'object' || input.command === null) {
    return v.parse(StrilaCommandSchema, { type: input.commandType })
  }
  return v.parse(StrilaCommandSchema, { ...input.command, type: input.commandType })
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

function serializeSnapshot(snapshot: StrilaSparringSnapshot): StrilaFrameState {
  return v.parse(StrilaFrameStateSchema, {
    ...snapshot.context,
    phase: getPhase(snapshot),
  })
}

function restoreSnapshot(state: StrilaFrameState): StrilaSparringSnapshot {
  const snapshot = createInitialSnapshot(state.targetPoints)
  const { phase: _phase, ...context } = state
  return strilaSparringMachine.resolveState({
    ...snapshot,
    value: phaseToSnapshotValue(state.phase),
    context: context satisfies StrilaContext,
  })
}

function strilaOutcome(state: StrilaFrameState): FrameOutcome | undefined {
  if (state.phase !== 'frame-over' || state.winner === null || state.winnerDeterminationReason === null) return undefined
  return {
    winnerSeat: state.winner,
    score: state.score,
    winReason: 'target-reached',
  }
}

export class StrilaGameplayRuntime implements GameplayRuntime {
  createInitialState(args: GameCreateStateArgs): StrilaFrameState {
    return serializeSnapshot(createInitialSnapshot(args.targetPointsBySeat))
  }

  parseState(state: unknown): StrilaFrameState {
    return v.parse(StrilaFrameStateSchema, state)
  }

  applyCommand(input: StrilaCommandEnvelope): GameCommandResult {
    const previous = this.parseState(input.state)
    const command = parseStrilaCommand(input)
    const next = sendEvent(restoreSnapshot(previous), command)
    const state = serializeSnapshot(next)
    const outcome = strilaOutcome(state)

    return {
      state,
      ...(outcome ? { outcome } : {}),
      protocolEntries: projectStrilaProtocolEntries({ previous, command, next: state }),
    }
  }

  deriveProjection(args: { state: unknown; projection: GameProjectionKey }): unknown {
    const state = this.parseState(args.state)

    switch (args.projection) {
      case 'control':
        return deriveStrilaControlView(state)
      case 'scoreboard':
        return deriveStrilaScoreboardView(state)
      case 'summary':
        return deriveStrilaSummaryView(state)
    }
  }
}

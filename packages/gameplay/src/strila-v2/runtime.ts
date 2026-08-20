import { type FrameOutcome } from '@ks/core'
import * as v from 'valibot'

import type { GameCommandResult, GameCreateStateArgs } from '../constants'
import type { GameplayDefinition } from '../registry'
import {
  type StrilaCommand,
  StrilaCommandSchema,
  type StrilaContext,
  type StrilaFrameState,
  StrilaFrameStateSchema,
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
  state: StrilaFrameState
  commandType: string
  command: unknown
}

function parseStrilaCommand(input: StrilaCommandEnvelope): StrilaCommand {
  const payload = v.safeParse(v.looseObject({}), input.command)
  if (!payload.success) {
    return v.parse(StrilaCommandSchema, { type: input.commandType })
  }
  return v.parse(StrilaCommandSchema, { ...payload.output, type: input.commandType })
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

export class StrilaGameplayRuntime implements GameplayDefinition<'strila-v2'> {
  readonly key = 'strila-v2'

  createInitialState(args: GameCreateStateArgs): StrilaFrameState {
    return serializeSnapshot(createInitialSnapshot(args.targetPointsBySeat))
  }

  applyCommand(input: StrilaCommandEnvelope): GameCommandResult<StrilaFrameState> {
    const previous = input.state
    const command = parseStrilaCommand(input)
    const next = sendEvent(restoreSnapshot(previous), command)
    const state = serializeSnapshot(next)
    const outcome = strilaOutcome(state)

    return {
      state,
      outcome,
      protocolEntries: projectStrilaProtocolEntries({ previous, command, next: state }),
    }
  }

  deriveControl(state: StrilaFrameState) {
    return deriveStrilaControlView(state)
  }

  deriveScoreboard(state: StrilaFrameState) {
    return deriveStrilaScoreboardView(state)
  }

  deriveSummary(state: StrilaFrameState) {
    return deriveStrilaSummaryView(state)
  }
}

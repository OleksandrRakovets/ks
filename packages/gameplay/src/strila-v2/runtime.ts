import invariant from 'tiny-invariant'

import { type GameCreateStateArgs, type GameProjectionKey, GameplayRuntime } from '../abstract-runtime'
import {
  StrilaCommandSchema,
  StrilaFrameStateSchema,
  type StrilaCommand,
  type StrilaFrameState,
  type StrilaProtocolEntry,
} from './definitions'
import { deriveStrilaControlView } from './projections/control'
import { deriveStrilaScoreboardView } from './projections/scoreboard'
import { projectStrilaProtocolEntries } from './protocol'
import { createEmptyStrilaFrameState, reduceStrilaCommand } from './reducer'

type StrilaCommandEnvelope = {
  state: unknown
  commandType: string
  command: unknown
}

function parseStrilaCommand(input: StrilaCommandEnvelope): StrilaCommand {
  invariant(typeof input.command === 'object' && input.command !== null, 'Invalid Strila command payload')
  return StrilaCommandSchema.parse({ ...input.command, type: input.commandType })
}

export class StrilaGameplayRuntime extends GameplayRuntime {
  createInitialState(args: GameCreateStateArgs): StrilaFrameState {
    return createEmptyStrilaFrameState(args.targetPointsBySeat)
  }

  parseState(state: unknown): StrilaFrameState {
    return StrilaFrameStateSchema.parse(state)
  }

  applyCommand(input: StrilaCommandEnvelope): { state: unknown; protocolEntries?: unknown[] } {
    const previous = this.parseState(input.state)
    const command = parseStrilaCommand(input)
    const next = reduceStrilaCommand(previous, command)

    return {
      state: next,
      protocolEntries: projectStrilaProtocolEntries({ previous, command, next }) satisfies StrilaProtocolEntry[],
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
        return deriveStrilaScoreboardView(state)
    }
  }
}

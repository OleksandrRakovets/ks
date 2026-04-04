import { BySeatNumberSchema, SeatSchema } from '@ks/core'
import invariant from 'tiny-invariant'
import { z } from 'zod'

import {
  GameControlProjectionSchema,
  GameScoreboardProjectionSchema,
  GameSummaryProjectionSchema,
  type GameProjectionKey,
} from '../abstract-runtime'
import { GameplayRuntime } from '../abstract-runtime'
import type { GameInputMode } from '../registry'

const PyramidFrameStateSchema = z.object({
  pointsBySeat: BySeatNumberSchema,
})

type PyramidFrameState = z.infer<typeof PyramidFrameStateSchema>

const ShotRecordedCommandSchema = z.object({
  seat: SeatSchema,
  points: z.number().int(),
})

type PyramidMeta = {
  gameKey: string
  title: {
    uk: string
    en: string
  }
  inputMode: GameInputMode
}
// TODO: declare winner as well, but allow the break to continue
export class PyramidGameplayRuntime extends GameplayRuntime {
  constructor(
    readonly meta: PyramidMeta,
    private readonly args: { allowNegative: boolean },
  ) {
    super()
  }

  createInitialState(): PyramidFrameState {
    return { pointsBySeat: { A: 0, B: 0 } }
  }

  parseState(state: unknown): PyramidFrameState {
    return PyramidFrameStateSchema.parse(state)
  }

  applyCommand(input: { state: unknown; commandType: string; command: unknown }) {
    invariant(input.commandType === 'shot.recorded', `Unsupported commandType: ${input.commandType}`)

    const state = this.parseState(input.state)
    const command = ShotRecordedCommandSchema.parse(input.command)
    const current = state.pointsBySeat[command.seat]
    const next = current + command.points

    return {
      state: {
        pointsBySeat:
          command.seat === 'A'
            ? {
                A: this.args.allowNegative ? next : Math.max(0, next),
                B: state.pointsBySeat.B,
              }
            : {
                A: state.pointsBySeat.A,
                B: this.args.allowNegative ? next : Math.max(0, next),
              },
      } satisfies PyramidFrameState,
    }
  }

  deriveProjection(args: { state: unknown; projection: GameProjectionKey }) {
    const state = this.parseState(args.state)

    switch (args.projection) {
      case 'control':
        return GameControlProjectionSchema.parse({
          gameKey: this.meta.gameKey,
          projection: 'control',
          score: state.pointsBySeat,
          availableCommands: [{ commandType: 'shot.recorded', command: {}, label: 'Record shot' }],
          details: {},
        })
      case 'scoreboard':
        return GameScoreboardProjectionSchema.parse({
          gameKey: this.meta.gameKey,
          projection: 'scoreboard',
          score: state.pointsBySeat,
          details: {},
        })
      case 'summary':
        return GameSummaryProjectionSchema.parse({
          gameKey: this.meta.gameKey,
          projection: 'summary',
          score: state.pointsBySeat,
          details: {},
        })
    }
  }
}

import { BySeatNumberSchema, SeatSchema } from '@ks/core'
import invariant from 'tiny-invariant'
import { z } from 'zod'

import {
  type GameCreateStateArgs,
  GameControlProjectionSchema,
  GameScoreboardProjectionSchema,
  GameSummaryProjectionSchema,
  type GameProjectionKey,
} from '../abstract-runtime'
import { GameplayRuntime } from '../abstract-runtime'
import type { GameInputMode } from '../registry'

const PyramidFrameStateSchema = z.object({
  pointsBySeat: BySeatNumberSchema,
  targetPointsBySeat: BySeatNumberSchema,
  phase: z.enum(['not-started', 'open-play', 'frame-over']),
  winnerSeat: SeatSchema.optional(),
})

type PyramidFrameState = z.infer<typeof PyramidFrameStateSchema>

const ShotRecordedCommandSchema = z.object({
  seat: SeatSchema,
  points: z.number().int(),
})

const BreakOffCommandSchema = z.object({
  seat: SeatSchema,
})

type PyramidMeta = {
  gameKey: string
  title: {
    uk: string
    en: string
  }
  inputMode: GameInputMode
}

const AwardFrameCommandSchema = z.object({
  seat: SeatSchema,
})

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

// TODO: declare winner as well, but allow the break to continue
export class PyramidGameplayRuntime extends GameplayRuntime {
  readonly meta: PyramidMeta
  private readonly args: { allowNegative: boolean }

  constructor(meta: PyramidMeta, args: { allowNegative: boolean }) {
    super()
    this.meta = meta
    this.args = args
  }

  createInitialState(args: GameCreateStateArgs): PyramidFrameState {
    return {
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: args.targetPointsBySeat,
      phase: 'not-started',
    }
  }

  parseState(state: unknown): PyramidFrameState {
    return PyramidFrameStateSchema.parse(state)
  }

  applyCommand(input: { state: unknown; commandType: string; command: unknown }) {
    const state = this.parseState(input.state)
    invariant(state.phase !== 'frame-over', 'Cannot apply pyramid command after frame-over')

    if (input.commandType === 'break-off') {
      BreakOffCommandSchema.parse(input.command)
      invariant(state.phase === 'not-started', 'Pyramid break-off is only allowed before open play starts')

      return {
        state: {
          ...state,
          phase: 'open-play',
        } satisfies PyramidFrameState,
      }
    }

    if (input.commandType === 'shot.recorded') {
      invariant(state.phase === 'open-play', 'Cannot record pyramid shot before break-off')
      const command = ShotRecordedCommandSchema.parse(input.command)
      const current = state.pointsBySeat[command.seat]
      const next = current + command.points

      return {
        state: {
          ...state,
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

    invariant(input.commandType === 'award-frame', `Unsupported commandType: ${input.commandType}`)
    const command = AwardFrameCommandSchema.parse(input.command)
    invariant(
      state.pointsBySeat[command.seat] >= state.targetPointsBySeat[command.seat],
      `Cannot award pyramid frame to ${command.seat} before target score`,
    )

    return {
      state: {
        ...state,
        phase: 'frame-over',
        winnerSeat: command.seat,
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
          availableCommands:
            state.phase === 'frame-over'
              ? []
              : state.phase === 'not-started'
                ? [
                    { commandType: 'break-off', command: { seat: 'A' }, label: 'Break-off (A)' },
                    { commandType: 'break-off', command: { seat: 'B' }, label: 'Break-off (B)' },
                  ]
                : [
                    { commandType: 'shot.recorded', command: {}, label: 'Record shot' },
                    ...(state.pointsBySeat.A >= state.targetPointsBySeat.A
                      ? [{ commandType: 'award-frame', command: { seat: 'A' }, label: 'Award frame' }]
                      : []),
                    ...(state.pointsBySeat.B >= state.targetPointsBySeat.B
                      ? [{ commandType: 'award-frame', command: { seat: 'B' }, label: 'Award frame' }]
                      : []),
                  ],
          details: pyramidDetails(state),
        })
      case 'scoreboard':
        return GameScoreboardProjectionSchema.parse({
          gameKey: this.meta.gameKey,
          projection: 'scoreboard',
          score: state.pointsBySeat,
          details: pyramidDetails(state),
        })
      case 'summary':
        return GameSummaryProjectionSchema.parse({
          gameKey: this.meta.gameKey,
          projection: 'summary',
          score: state.pointsBySeat,
          details: pyramidDetails(state),
        })
    }
  }
}

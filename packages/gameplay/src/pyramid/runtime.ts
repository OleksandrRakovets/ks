import { BySeatNumberSchema, SeatSchema } from '@ks/core'
import invariant from 'tiny-invariant'
import { z } from 'zod'

import {
  type GameCreateStateArgs,
  GameCommandPresetSchema,
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

const FoulCommittedCommandSchema = z.object({
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

function command(
  commandType: string,
  payload: Record<string, unknown>,
  label: string,
  extras: { prominence: 'primary' | 'secondary' | 'tertiary'; effectSummary?: string; warning?: string; helpText?: string },
) {
  return { commandType, command: payload, label, ...extras }
}

const PyramidControlCommandSchema = GameCommandPresetSchema.extend({
  label: z.string().min(1),
})

const PyramidControlCommandSectionSchema = z.object({
  A: z.array(PyramidControlCommandSchema),
  B: z.array(PyramidControlCommandSchema),
})

const PyramidControlDetailsSchema = z.object({
  phase: z.enum(['not-started', 'open-play', 'frame-over']),
  winner: SeatSchema.optional(),
  situationTitle: z.string().min(1),
  situationSummary: z.string().min(1),
  isPotCommandAvailable: z.boolean(),
  commandSections: z.object({
    primary: PyramidControlCommandSectionSchema,
    secondary: PyramidControlCommandSectionSchema,
    tertiary: PyramidControlCommandSectionSchema,
  }),
})

export const PyramidControlViewSchema = GameControlProjectionSchema.extend({
  details: PyramidControlDetailsSchema,
})

function seatFromCommandPayload(commandPayload: Record<string, unknown>): 'A' | 'B' | null {
  const seat = commandPayload.seat
  if (seat === 'A' || seat === 'B') return seat
  return null
}

function deriveCommandSections(commands: z.infer<typeof PyramidControlCommandSchema>[]) {
  const sections = {
    primary: { A: [] as z.infer<typeof PyramidControlCommandSchema>[], B: [] as z.infer<typeof PyramidControlCommandSchema>[] },
    secondary: {
      A: [] as z.infer<typeof PyramidControlCommandSchema>[],
      B: [] as z.infer<typeof PyramidControlCommandSchema>[],
    },
    tertiary: {
      A: [] as z.infer<typeof PyramidControlCommandSchema>[],
      B: [] as z.infer<typeof PyramidControlCommandSchema>[],
    },
  }

  for (const entry of commands) {
    const seat = seatFromCommandPayload(entry.command)
    if (!seat) continue
    sections[entry.prominence][seat].push(entry)
  }

  return sections
}

// TODO: declare winner as well, but allow the break to continue
export class PyramidGameplayRuntime extends GameplayRuntime {
  readonly meta: PyramidMeta
  private readonly args: {
    allowNegative: boolean
    foulPenalty: 'opponent-plus-one' | 'offender-minus-one'
    shotPointOptions: number[]
  }

  constructor(
    meta: PyramidMeta,
    args: {
      allowNegative: boolean
      foulPenalty: 'opponent-plus-one' | 'offender-minus-one'
      shotPointOptions: number[]
    },
  ) {
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

    if (input.commandType === 'frame.commence') {
      BreakOffCommandSchema.parse(input.command)
      invariant(state.phase === 'not-started', 'Pyramid frame.commence is only allowed before open play starts')

      return {
        state: {
          ...state,
          phase: 'open-play',
        } satisfies PyramidFrameState,
      }
    }

    if (input.commandType === 'pot.record') {
      invariant(state.phase === 'open-play', 'Cannot record pyramid shot before frame.commence')
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

    if (input.commandType === 'foul.commit') {
      invariant(state.phase === 'open-play', 'Cannot record pyramid foul before frame.commence')
      const command = FoulCommittedCommandSchema.parse(input.command)

      if (this.args.foulPenalty === 'opponent-plus-one') {
        const targetSeat = command.seat === 'A' ? 'B' : 'A'
        const current = state.pointsBySeat[targetSeat]

        return {
          state: {
            ...state,
            pointsBySeat:
              targetSeat === 'A'
                ? {
                    A: current + 1,
                    B: state.pointsBySeat.B,
                  }
                : {
                    A: state.pointsBySeat.A,
                    B: current + 1,
                  },
          } satisfies PyramidFrameState,
        }
      }

      const current = state.pointsBySeat[command.seat]
      const next = current - 1
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

    invariant(input.commandType === 'frame.award', `Unsupported commandType: ${input.commandType}`)
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
      case 'control': {
        if (state.phase === 'not-started') {
          const commands = [
            command('frame.commence', { seat: 'A' }, 'Break-off (A)', { prominence: 'primary' }),
            command('frame.commence', { seat: 'B' }, 'Break-off (B)', { prominence: 'primary' }),
          ]
          return PyramidControlViewSchema.parse({
            gameKey: this.meta.gameKey,
            projection: 'control',
            score: state.pointsBySeat,
            details: {
              ...pyramidDetails(state),
              situationTitle: 'Break-off',
              situationSummary: 'Choose the player to open the frame.',
              isPotCommandAvailable: false,
              commandSections: deriveCommandSections(commands),
            },
          })
        }

        if (state.phase === 'open-play') {
          const seats: Array<'A' | 'B'> = ['A', 'B']
          const commands = [
            ...seats.flatMap((seat) =>
              this.args.shotPointOptions.map((points, index) =>
                command('pot.record', { seat, points }, `+${points}`, { prominence: index === 0 ? 'primary' : 'secondary' }),
              ),
            ),
            ...seats.map((seat) =>
              command('foul.commit', { seat }, 'Фол', {
                prominence: 'secondary',
                effectSummary:
                  this.args.foulPenalty === 'opponent-plus-one' ? 'Opponent +1 point' : 'Offender -1 point (negative allowed)',
              }),
            ),
            ...(state.pointsBySeat.A >= state.targetPointsBySeat.A
              ? [command('frame.award', { seat: 'A' }, 'Award frame', { prominence: 'primary' })]
              : []),
            ...(state.pointsBySeat.B >= state.targetPointsBySeat.B
              ? [command('frame.award', { seat: 'B' }, 'Award frame', { prominence: 'primary' })]
              : []),
          ]

          return PyramidControlViewSchema.parse({
            gameKey: this.meta.gameKey,
            projection: 'control',
            score: state.pointsBySeat,
            details: {
              ...pyramidDetails(state),
              situationTitle: 'Open play',
              situationSummary: 'Record shot value or foul for either player.',
              isPotCommandAvailable: true,
              commandSections: deriveCommandSections(commands),
            },
          })
        }

        return PyramidControlViewSchema.parse({
          gameKey: this.meta.gameKey,
          projection: 'control',
          score: state.pointsBySeat,
          details: {
            ...pyramidDetails(state),
            situationTitle: 'Frame over',
            situationSummary: 'No further scoring commands are available.',
            isPotCommandAvailable: false,
            commandSections: {
              primary: { A: [], B: [] },
              secondary: { A: [], B: [] },
              tertiary: { A: [], B: [] },
            },
          },
        })
      }
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

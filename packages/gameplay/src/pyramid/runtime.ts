import {
  BySeatNumberSchema,
  IntegerSchema,
  NonEmptyStringSchema,
  ProtocolEntrySchema,
  SeatSchema,
  emptyControlCommandSections,
  opponentOf,
  type FrameOutcome,
  type ProtocolEntry,
} from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import {
  type GameplayRuntime,
  type GameCreateStateArgs,
  GameCommandPresetSchema,
  GameScoreboardProjectionSchema,
  GameSummaryProjectionSchema,
  type GameProjectionKey,
} from '../constants'
import { PyramidControlViewSchema } from './definitions'

const PyramidFrameStateSchema = v.object({
  pointsBySeat: BySeatNumberSchema,
  targetPointsBySeat: BySeatNumberSchema,
  phase: v.picklist(['not-started', 'open-play', 'frame-over']),
  winnerSeat: v.optional(SeatSchema),
})

type PyramidFrameState = v.InferOutput<typeof PyramidFrameStateSchema>

function pyramidOutcome(state: PyramidFrameState): FrameOutcome | undefined {
  if (state.phase !== 'frame-over' || !state.winnerSeat) return undefined
  return {
    winnerSeat: state.winnerSeat,
    score: state.pointsBySeat,
    winReason: 'target-reached',
  }
}

const ShotRecordedCommandSchema = v.object({
  seat: SeatSchema,
  points: IntegerSchema,
})

const BreakOffCommandSchema = v.object({
  seat: SeatSchema,
})

const FoulCommittedCommandSchema = v.object({
  seat: SeatSchema,
})

const AwardFrameCommandSchema = v.object({
  seat: SeatSchema,
})

const PyramidProtocolEntryBodySchema = v.variant('commandType', [
  v.object({ commandType: v.literal('frame.commence') }),
  v.object({ commandType: v.literal('pot.record'), points: IntegerSchema }),
  v.object({ commandType: v.literal('foul.commit'), penalty: v.picklist(['opponent-plus-one', 'offender-minus-one']) }),
  v.object({ commandType: v.literal('frame.award') }),
])

const PyramidProtocolEntrySchema = v.object({
  ...ProtocolEntrySchema.entries,
  body: PyramidProtocolEntryBodySchema,
})

function scoreChanged(previous: PyramidFrameState, next: PyramidFrameState): boolean {
  return previous.pointsBySeat.A !== next.pointsBySeat.A || previous.pointsBySeat.B !== next.pointsBySeat.B
}

function protocolEntry(args: {
  seat: 'A' | 'B'
  body: v.InferOutput<typeof PyramidProtocolEntryBodySchema>
  previous: PyramidFrameState
  next: PyramidFrameState
}): ProtocolEntry {
  return v.parse(PyramidProtocolEntrySchema, {
    source: 'player',
    entryType: 'player-command',
    seat: args.seat,
    ...(scoreChanged(args.previous, args.next) ? { scoreAfter: args.next.pointsBySeat } : {}),
    body: args.body,
  })
}

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

const PyramidControlCommandSchema = v.object({
  ...GameCommandPresetSchema.entries,
  label: NonEmptyStringSchema,
})
type PyramidControlCommand = v.InferOutput<typeof PyramidControlCommandSchema>

function command(
  commandType: string,
  payload: Record<string, unknown>,
  label: string,
  extras: Omit<PyramidControlCommand, 'source' | 'commandType' | 'command' | 'seat' | 'label'>,
): PyramidControlCommand {
  const seat = payload.seat === 'A' || payload.seat === 'B' ? payload.seat : undefined
  return { source: 'game', commandType, command: payload, seat, label, ...extras }
}

function deriveCommandSections(commands: v.InferOutput<typeof PyramidControlCommandSchema>[]) {
  const sections = emptyControlCommandSections()

  for (const entry of commands) {
    if (entry.seat) {
      sections[entry.prominence][entry.seat].push(entry)
    } else {
      sections.neutral.push(entry)
    }
  }

  return sections
}

// TODO: declare winner as well, but allow the break to continue
export class PyramidGameplayRuntime implements GameplayRuntime {
  private readonly config: {
    gameKey: string
    allowNegative: boolean
    foulPenalty: 'opponent-plus-one' | 'offender-minus-one'
    shotPointOptions: number[]
  }

  constructor(config: {
    gameKey: string
    allowNegative: boolean
    foulPenalty: 'opponent-plus-one' | 'offender-minus-one'
    shotPointOptions: number[]
  }) {
    this.config = config
  }

  createInitialState(args: GameCreateStateArgs): PyramidFrameState {
    return {
      pointsBySeat: { A: 0, B: 0 },
      targetPointsBySeat: args.targetPointsBySeat,
      phase: 'not-started',
    }
  }

  parseState(state: unknown): PyramidFrameState {
    return v.parse(PyramidFrameStateSchema, state)
  }

  applyCommand(input: { state: unknown; commandType: string; command: unknown }) {
    const state = this.parseState(input.state)
    invariant(state.phase !== 'frame-over', 'Cannot apply pyramid command after frame-over')

    if (input.commandType === 'frame.commence') {
      const command = v.parse(BreakOffCommandSchema, input.command)
      invariant(state.phase === 'not-started', 'Pyramid frame.commence is only allowed before open play starts')
      const nextState = {
        ...state,
        phase: 'open-play',
      } satisfies PyramidFrameState

      return {
        state: nextState,
        protocolEntries: [
          protocolEntry({ seat: command.seat, body: { commandType: 'frame.commence' }, previous: state, next: nextState }),
        ],
      }
    }

    if (input.commandType === 'pot.record') {
      invariant(state.phase === 'open-play', 'Cannot record pyramid shot before frame.commence')
      const command = v.parse(ShotRecordedCommandSchema, input.command)
      const current = state.pointsBySeat[command.seat]
      const next = current + command.points

      const nextState = {
        ...state,
        pointsBySeat:
          command.seat === 'A'
            ? {
                A: this.config.allowNegative ? next : Math.max(0, next),
                B: state.pointsBySeat.B,
              }
            : {
                A: state.pointsBySeat.A,
                B: this.config.allowNegative ? next : Math.max(0, next),
              },
      } satisfies PyramidFrameState

      return {
        state: nextState,
        protocolEntries: [
          protocolEntry({
            seat: command.seat,
            body: { commandType: 'pot.record', points: command.points },
            previous: state,
            next: nextState,
          }),
        ],
      }
    }

    if (input.commandType === 'foul.commit') {
      invariant(state.phase === 'open-play', 'Cannot record pyramid foul before frame.commence')
      const command = v.parse(FoulCommittedCommandSchema, input.command)

      if (this.config.foulPenalty === 'opponent-plus-one') {
        const targetSeat = opponentOf(command.seat)
        const current = state.pointsBySeat[targetSeat]

        const nextState = {
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
        } satisfies PyramidFrameState

        return {
          state: nextState,
          protocolEntries: [
            protocolEntry({
              seat: command.seat,
              body: { commandType: 'foul.commit', penalty: this.config.foulPenalty },
              previous: state,
              next: nextState,
            }),
          ],
        }
      }

      const current = state.pointsBySeat[command.seat]
      const next = current - 1
      const nextState = {
        ...state,
        pointsBySeat:
          command.seat === 'A'
            ? {
                A: this.config.allowNegative ? next : Math.max(0, next),
                B: state.pointsBySeat.B,
              }
            : {
                A: state.pointsBySeat.A,
                B: this.config.allowNegative ? next : Math.max(0, next),
              },
      } satisfies PyramidFrameState

      return {
        state: nextState,
        protocolEntries: [
          protocolEntry({
            seat: command.seat,
            body: { commandType: 'foul.commit', penalty: this.config.foulPenalty },
            previous: state,
            next: nextState,
          }),
        ],
      }
    }

    invariant(input.commandType === 'frame.award', `Unsupported commandType: ${input.commandType}`)
    const command = v.parse(AwardFrameCommandSchema, input.command)
    invariant(
      state.pointsBySeat[command.seat] >= state.targetPointsBySeat[command.seat],
      `Cannot award pyramid frame to ${command.seat} before target score`,
    )

    const nextState = {
      ...state,
      phase: 'frame-over',
      winnerSeat: command.seat,
    } satisfies PyramidFrameState
    const outcome = pyramidOutcome(nextState)

    return {
      state: nextState,
      ...(outcome ? { outcome } : {}),
      protocolEntries: [
        protocolEntry({ seat: command.seat, body: { commandType: 'frame.award' }, previous: state, next: nextState }),
      ],
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
          return v.parse(PyramidControlViewSchema, {
            gameKey: this.config.gameKey,
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
              this.config.shotPointOptions.map((points, index) =>
                command('pot.record', { seat, points }, `+${points}`, { prominence: index === 0 ? 'primary' : 'secondary' }),
              ),
            ),
            ...seats.map((seat) =>
              command('foul.commit', { seat }, 'Фол', {
                prominence: 'secondary',
                effectSummary:
                  this.config.foulPenalty === 'opponent-plus-one'
                    ? 'Opponent +1 point'
                    : 'Offender -1 point (negative allowed)',
              }),
            ),
            ...(state.pointsBySeat.A >= state.targetPointsBySeat.A
              ? [command('frame.award', { seat: 'A' }, 'Award frame', { prominence: 'primary' })]
              : []),
            ...(state.pointsBySeat.B >= state.targetPointsBySeat.B
              ? [command('frame.award', { seat: 'B' }, 'Award frame', { prominence: 'primary' })]
              : []),
          ]

          return v.parse(PyramidControlViewSchema, {
            gameKey: this.config.gameKey,
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

        return v.parse(PyramidControlViewSchema, {
          gameKey: this.config.gameKey,
          projection: 'control',
          score: state.pointsBySeat,
          details: {
            ...pyramidDetails(state),
            situationTitle: 'Frame over',
            situationSummary: 'No further scoring commands are available.',
            isPotCommandAvailable: false,
            commandSections: emptyControlCommandSections(),
          },
        })
      }
      case 'scoreboard':
        return v.parse(GameScoreboardProjectionSchema, {
          gameKey: this.config.gameKey,
          projection: 'scoreboard',
          score: state.pointsBySeat,
          details: pyramidDetails(state),
        })
      case 'summary':
        return v.parse(GameSummaryProjectionSchema, {
          gameKey: this.config.gameKey,
          projection: 'summary',
          score: state.pointsBySeat,
          details: pyramidDetails(state),
        })
    }
  }
}

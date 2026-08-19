import { IntegerSchema, ProtocolEntrySchema, SeatSchema, opponentOf, type FrameOutcome, type ProtocolEntry } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { type GameplayRuntime, type GameCreateStateArgs, type GameProjectionKey } from '../constants'
import { PyramidFrameStateSchema, type PyramidFrameState, type PyramidRuntimeConfig } from './definitions'
import { derivePyramidControlView } from './projections/control'
import { derivePyramidScoreboardView } from './projections/scoreboard'
import { derivePyramidSummaryView } from './projections/summary'

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
    scoreAfter: scoreChanged(args.previous, args.next) ? args.next.pointsBySeat : undefined,
    body: args.body,
  })
}

export class PyramidGameplayRuntime implements GameplayRuntime {
  private readonly config: PyramidRuntimeConfig

  constructor(config: PyramidRuntimeConfig) {
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
      const command = v.parse(ShotRecordedCommandSchema, input.command)
      invariant(state.phase === 'open-play' || state.phase === 'winner-determined', 'Cannot record pyramid shot now')
      if (state.phase === 'winner-determined')
        invariant(command.seat === state.winnerSeat, 'Only determined winner may continue scoring')
      const current = state.pointsBySeat[command.seat]
      const next = current + command.points

      let nextState = {
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

      if (state.phase === 'open-play' && nextState.pointsBySeat[command.seat] >= nextState.targetPointsBySeat[command.seat]) {
        nextState = { ...nextState, phase: 'winner-determined', winnerSeat: command.seat }
      }

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
      const command = v.parse(FoulCommittedCommandSchema, input.command)
      invariant(state.phase === 'open-play' || state.phase === 'winner-determined', 'Cannot record pyramid foul now')
      if (state.phase === 'winner-determined')
        invariant(command.seat === state.winnerSeat, 'Only determined winner may foul after target')

      if (this.config.foulPenalty === 'opponent-plus-one') {
        const targetSeat = opponentOf(command.seat)
        const current = state.pointsBySeat[targetSeat]

        let nextState = {
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

        if (state.phase === 'open-play' && nextState.pointsBySeat[targetSeat] >= nextState.targetPointsBySeat[targetSeat]) {
          nextState = { ...nextState, phase: 'winner-determined', winnerSeat: targetSeat }
        }

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
      let nextState = {
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

      if (state.phase === 'open-play' && nextState.pointsBySeat[command.seat] >= nextState.targetPointsBySeat[command.seat]) {
        nextState = { ...nextState, phase: 'winner-determined', winnerSeat: command.seat }
      }

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
    invariant(state.phase === 'winner-determined', 'Cannot award pyramid frame before winner')
    invariant(state.winnerSeat === command.seat, `Cannot award pyramid frame to ${command.seat}`)

    const nextState = {
      ...state,
      phase: 'frame-over',
      winnerSeat: command.seat,
    } satisfies PyramidFrameState
    const outcome = pyramidOutcome(nextState)

    return {
      state: nextState,
      outcome,
      protocolEntries: [
        protocolEntry({ seat: command.seat, body: { commandType: 'frame.award' }, previous: state, next: nextState }),
      ],
    }
  }

  deriveProjection(args: { state: unknown; projection: GameProjectionKey }) {
    const state = this.parseState(args.state)

    switch (args.projection) {
      case 'control':
        return derivePyramidControlView(state, this.config)
      case 'scoreboard':
        return derivePyramidScoreboardView(state, this.config)
      case 'summary':
        return derivePyramidSummaryView(state, this.config)
    }
  }
}

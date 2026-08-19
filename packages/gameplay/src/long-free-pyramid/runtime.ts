import {
  IntegerSchema,
  ProtocolEntrySchema,
  SeatSchema,
  opponentOf,
  type FrameOutcome,
  type ProtocolEntry,
  type Seat,
} from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import type { GameCreateStateArgs, GameProjectionKey, GameplayRuntime } from '../constants'
import {
  LongFreePyramidFrameStateSchema,
  type LongFreePyramidFrameState,
  type LongFreePyramidProjectionDetails,
  type LongFreePyramidRack,
} from './definitions'
import { deriveLongFreePyramidControlView } from './projections/control'
import { deriveLongFreePyramidScoreboardView } from './projections/scoreboard'
import { deriveLongFreePyramidSummaryView } from './projections/summary'

const PotRecordedCommandSchema = v.object({ seat: SeatSchema, points: v.pipe(IntegerSchema, v.minValue(1), v.maxValue(4)) })
const SeatCommandSchema = v.object({ seat: SeatSchema })

const ProtocolEntryBodySchema = v.variant('commandType', [
  v.object({ commandType: v.literal('frame.commence') }),
  v.object({ commandType: v.literal('pot.record'), points: IntegerSchema }),
  v.object({ commandType: v.literal('foul.commit'), penalty: v.literal('opponent-plus-one') }),
  v.object({ commandType: v.literal('frame.award') }),
])

const LongFreePyramidProtocolEntrySchema = v.object({
  ...ProtocolEntrySchema.entries,
  body: ProtocolEntryBodySchema,
})

function zeroScore() {
  return { A: 0, B: 0 }
}

function score(state: LongFreePyramidFrameState) {
  return state.racks.reduce((sum, rack) => ({ A: sum.A + rack.scoreBySeat.A, B: sum.B + rack.scoreBySeat.B }), zeroScore())
}

function currentRack(state: LongFreePyramidFrameState): LongFreePyramidRack {
  const rack = state.racks.at(-1)
  invariant(rack, 'Long free pyramid state must contain at least one rack')
  return rack
}

function removedByRack(rack: LongFreePyramidRack): number {
  return rack.scoreBySeat.A + rack.scoreBySeat.B
}

function ballsOnTable(state: LongFreePyramidFrameState): number {
  return Math.max(0, 16 - removedByRack(currentRack(state)))
}

function addRackScore(rack: LongFreePyramidRack, seat: Seat, points: number): LongFreePyramidRack {
  return { ...rack, scoreBySeat: { ...rack.scoreBySeat, [seat]: rack.scoreBySeat[seat] + points } }
}

function replaceCurrentRack(state: LongFreePyramidFrameState, rack: LongFreePyramidRack): LongFreePyramidFrameState {
  return { ...state, racks: [...state.racks.slice(0, -1), rack] }
}

function appendRack(state: LongFreePyramidFrameState): LongFreePyramidFrameState {
  const nextRackNumber = currentRack(state).rackNumber + 1
  return {
    ...state,
    racks: [...state.racks, { rackNumber: nextRackNumber, scoreBySeat: zeroScore() }],
    messages: [{ code: 'rack-started', rackNumber: nextRackNumber }],
  }
}

function maybeRollRack(state: LongFreePyramidFrameState): LongFreePyramidFrameState {
  if (removedByRack(currentRack(state)) < state.rackRollover || state.phase === 'awaiting-award') return state
  return appendRack(state)
}

function protocolEntry(args: {
  seat: Seat
  body: v.InferOutput<typeof ProtocolEntryBodySchema>
  previous: LongFreePyramidFrameState
  next: LongFreePyramidFrameState
}): ProtocolEntry {
  const previousScore = score(args.previous)
  const nextScore = score(args.next)
  return v.parse(LongFreePyramidProtocolEntrySchema, {
    source: 'player',
    entryType: 'player-command',
    seat: args.seat,
    ...(previousScore.A !== nextScore.A || previousScore.B !== nextScore.B ? { scoreAfter: nextScore } : {}),
    body: args.body,
  })
}

function details(state: LongFreePyramidFrameState): LongFreePyramidProjectionDetails {
  const rack = currentRack(state)
  return {
    phase: state.phase,
    winner: state.winnerSeat,
    rackHistory: state.racks,
    currentRack: rack,
    ballsRemoved: removedByRack(rack),
    ballsOnTable: ballsOnTable(state),
    messages: state.messages,
  }
}

function outcome(state: LongFreePyramidFrameState): FrameOutcome | undefined {
  if (state.phase !== 'frame-over' || !state.winnerSeat) return undefined
  return { winnerSeat: state.winnerSeat, score: score(state), winReason: 'target-reached' }
}

export class LongFreePyramidGameplayRuntime implements GameplayRuntime {
  createInitialState(args: GameCreateStateArgs): LongFreePyramidFrameState {
    const rackRollover = args.gameConfiguration?.rackRollover
    invariant(rackRollover === 14 || rackRollover === 15, 'Long free pyramid requires rackRollover 14 or 15')
    return {
      racks: [{ rackNumber: 1, scoreBySeat: zeroScore() }],
      targetPointsBySeat: args.targetPointsBySeat,
      rackRollover,
      phase: 'not-started',
      messages: [],
    }
  }

  parseState(state: unknown): LongFreePyramidFrameState {
    return v.parse(LongFreePyramidFrameStateSchema, state)
  }

  applyCommand(input: { state: unknown; commandType: string; command: unknown }) {
    const state = this.parseState(input.state)
    invariant(state.phase !== 'frame-over', 'Cannot apply long free pyramid command after frame-over')

    if (input.commandType === 'frame.commence') {
      const command = v.parse(SeatCommandSchema, input.command)
      invariant(state.phase === 'not-started', 'Long free pyramid frame.commence is only allowed before open play')
      const next = { ...state, phase: 'open-play' as const }
      return {
        state: next,
        protocolEntries: [
          protocolEntry({ seat: command.seat, body: { commandType: 'frame.commence' }, previous: state, next }),
        ],
      }
    }

    if (input.commandType === 'pot.record') {
      const command = v.parse(PotRecordedCommandSchema, input.command)
      invariant(state.phase === 'open-play' || state.phase === 'winner-determined', 'Cannot record long free pyramid pot now')
      invariant(command.points <= ballsOnTable(state), 'Cannot pot more balls than remain on the current rack')
      if (state.phase === 'winner-determined')
        invariant(command.seat === state.winnerSeat, 'Only determined winner may continue scoring')

      let next = replaceCurrentRack(state, addRackScore(currentRack(state), command.seat, command.points))
      next = { ...next, messages: [] }
      const nextScore = score(next)
      if (next.phase === 'open-play' && nextScore[command.seat] >= next.targetPointsBySeat[command.seat]) {
        next = { ...next, phase: 'winner-determined', winnerSeat: command.seat }
      }
      next = maybeRollRack(next)
      return {
        state: next,
        protocolEntries: [
          protocolEntry({
            seat: command.seat,
            body: { commandType: 'pot.record', points: command.points },
            previous: state,
            next,
          }),
        ],
      }
    }

    if (input.commandType === 'foul.commit') {
      const command = v.parse(SeatCommandSchema, input.command)
      invariant(state.phase === 'open-play' || state.phase === 'winner-determined', 'Cannot record long free pyramid foul now')
      invariant(ballsOnTable(state) >= 1, 'Cannot remove a foul ball from an empty rack')
      if (state.phase === 'winner-determined')
        invariant(command.seat === state.winnerSeat, 'Only determined winner may foul after target')

      const awardedSeat = opponentOf(command.seat)
      let next = replaceCurrentRack(state, addRackScore(currentRack(state), awardedSeat, 1))
      next = { ...next, messages: [] }
      const nextScore = score(next)
      if (state.phase === 'winner-determined') next = { ...next, phase: 'awaiting-award' }
      else if (nextScore[awardedSeat] >= next.targetPointsBySeat[awardedSeat])
        next = { ...next, phase: 'awaiting-award', winnerSeat: awardedSeat }
      next = maybeRollRack(next)
      return {
        state: next,
        protocolEntries: [
          protocolEntry({
            seat: command.seat,
            body: { commandType: 'foul.commit', penalty: 'opponent-plus-one' },
            previous: state,
            next,
          }),
        ],
      }
    }

    invariant(input.commandType === 'frame.award', `Unsupported commandType: ${input.commandType}`)
    const command = v.parse(SeatCommandSchema, input.command)
    invariant(state.winnerSeat === command.seat, `Cannot award long free pyramid frame to ${command.seat}`)
    invariant(
      state.phase === 'winner-determined' || state.phase === 'awaiting-award',
      'Cannot award long free pyramid frame before winner',
    )
    const next = { ...state, phase: 'frame-over' as const }
    const frameOutcome = outcome(next)
    return {
      state: next,
      ...(frameOutcome ? { outcome: frameOutcome } : {}),
      protocolEntries: [protocolEntry({ seat: command.seat, body: { commandType: 'frame.award' }, previous: state, next })],
    }
  }

  deriveProjection(args: { state: unknown; projection: GameProjectionKey }) {
    const state = this.parseState(args.state)
    const stateScore = score(state)
    const projectionDetails = details(state)

    switch (args.projection) {
      case 'control':
        return deriveLongFreePyramidControlView({
          state,
          score: stateScore,
          details: projectionDetails,
          ballsOnTable: ballsOnTable(state),
        })
      case 'scoreboard':
        return deriveLongFreePyramidScoreboardView({ score: stateScore, details: projectionDetails })
      case 'summary':
        return deriveLongFreePyramidSummaryView({ score: stateScore, details: projectionDetails })
    }
  }
}

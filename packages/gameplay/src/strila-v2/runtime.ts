import { emptyControlCommandSections, opponentOf, type FrameOutcome, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'

import { GameplayRuntime } from '../abstract-runtime'
import type { GameCreateStateArgs, GameProjectionKey } from '../constants'
import {
  StrilaMeta,
  StrilaBallStatusesSchema,
  StrilaCommandSchema,
  StrilaControlViewSchema,
  StrilaFrameStateSchema,
  StrilaScoreboardViewSchema,
  StrilaSummaryViewSchema,
  type StrilaCommand,
  type StrilaColoredBall,
  type StrilaContext,
  type StrilaControlCommand,
  type StrilaControlDetails,
  type StrilaControlView,
  type StrilaFrameState,
  type StrilaPhase,
  type StrilaScoreboardView,
} from './definitions'
import {
  createInitialSnapshot,
  getPhase,
  sendEvent,
  strilaSparringMachine,
  type StrilaSparringSnapshot,
} from './machine-sparring'
import { projectStrilaProtocolEntries } from './protocol'

export { StrilaFrameStateSchema, type StrilaFrameState }

type StrilaCommandEnvelope = {
  state: unknown
  commandType: string
  command: unknown
}

function command(
  commandType: StrilaCommand['type'],
  payload: Record<string, unknown>,
  label: string,
  extras: Omit<StrilaControlCommand, 'source' | 'commandType' | 'command' | 'seat' | 'label'>,
): StrilaControlCommand {
  const seat = payload.seat === 'A' || payload.seat === 'B' ? payload.seat : undefined
  return { source: 'game', commandType, command: payload, seat, label, ...extras }
}

function seatCommands(commandType: StrilaCommand['type'], label: string, prominence: StrilaControlCommand['prominence']) {
  return [
    command(commandType, { seat: 'A' }, label, { prominence }),
    command(commandType, { seat: 'B' }, label, { prominence }),
  ]
}

function computeStrilaObjectBalls(coloredBallsOnTable: readonly StrilaColoredBall[]): StrilaColoredBall[] {
  if (coloredBallsOnTable.length <= 1) return [...coloredBallsOnTable]
  if (coloredBallsOnTable.length === 2) return coloredBallsOnTable.slice(0, 1)
  return coloredBallsOnTable.slice(0, 2)
}

function computeStrilaPointsAvailable(coloredBallsOnTable: readonly StrilaColoredBall[]): number {
  if (coloredBallsOnTable.length <= 1) return 2
  return coloredBallsOnTable.length * 2
}

function deriveBallStatuses(state: StrilaFrameState): StrilaControlDetails['ballStatuses'] {
  const objectBalls = new Set(computeStrilaObjectBalls(state.coloredBallsOnTable))
  const onTableColored = new Set(state.coloredBallsOnTable)
  const cueStatus: 'object' | 'on-table' = state.phase === 'respotted-black.opening' ? 'on-table' : 'object'
  const ballStatuses = StrilaBallStatusesSchema.parse({
    0: cueStatus,
    1: 'potted',
    2: 'potted',
    3: 'potted',
    4: 'potted',
    5: 'potted',
    6: 'potted',
    7: 'potted',
  })

  for (const ball of StrilaMeta.allBalls) {
    if (ball === 0) {
      ballStatuses[ball] = cueStatus
      continue
    }
    if (objectBalls.has(ball)) {
      ballStatuses[ball] = 'object'
      continue
    }
    if (onTableColored.has(ball)) {
      ballStatuses[ball] = 'on-table'
      continue
    }
    ballStatuses[ball] = 'potted'
  }

  return ballStatuses
}

function deriveCommandSections(commands: StrilaControlCommand[]): StrilaControlDetails['commandSections'] {
  const sections = emptyControlCommandSections()

  commands.forEach((entry) => {
    if (entry.seat) {
      sections[entry.prominence][entry.seat].push(entry)
    } else {
      sections.neutral.push(entry)
    }
  })

  return sections
}

function messages(entries: Array<{ type: 'hint' | 'warning'; text: string }>) {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.text)) return false
    seen.add(entry.text)
    return true
  })
}

function view(
  state: StrilaFrameState,
  args: {
    commands: StrilaControlCommand[]
    situationTitle: string
    situationSummary: string
    seat?: Seat
    messages?: Array<{ type: 'hint' | 'warning'; text: string }>
  },
): StrilaControlView {
  return StrilaControlViewSchema.parse({
    gameKey: 'strila-v2',
    projection: 'control',
    score: state.score,
    details: {
      phase: state.phase,
      seat: args.seat,
      situationTitle: args.situationTitle,
      situationSummary: args.situationSummary,
      isPotCommandAvailable: args.commands.some((entry) => entry.commandType === 'pot.record'),
      ballStatuses: deriveBallStatuses(state),
      commandSections: deriveCommandSections(args.commands),
      messages: messages(args.messages ?? []),
    },
  })
}

export function deriveStrilaControlView(state: StrilaFrameState): StrilaControlView {
  switch (state.phase) {
    case 'not-started':
      return view(state, {
        commands: seatCommands('frame.commence', 'Break-off', 'primary'),
        situationTitle: 'Break-off',
        situationSummary: 'Record the opening shot.',
      })
    case 'open-play':
      return view(state, {
        commands: [
          ...seatCommands('pot.record', 'Record pot', 'primary'),
          ...seatCommands('foul.commit', 'Foul committed', 'secondary'),
        ],
        situationTitle: 'Open play',
        situationSummary: 'Log pots or a foul.',
      })
    case 'foul-committed.penalty-selection': {
      invariant(state.foulOffender !== null, 'Foul offender is required while selecting a foul penalty')
      const chooser = opponentOf(state.foulOffender)
      return view(state, {
        commands: [
          command('penalty.select', { seat: chooser, choice: 'play-from-position' }, 'Play from position', {
            prominence: 'secondary',
            effectSummary: '+1 point',
          }),
          command('penalty.select', { seat: chooser, choice: 'pass-position' }, 'Pass position', {
            prominence: 'secondary',
            effectSummary: '+1 point',
          }),
          command('penalty.select', { seat: chooser, choice: 'ball-in-hand' }, 'Ball in hand', {
            prominence: 'secondary',
            effectSummary: 'No points awarded',
          }),
        ],
        seat: chooser,
        situationTitle: 'Select penalty',
        situationSummary: 'Opponent committed a foul. Choose the response.',
      })
    }
    case 'foul-committed.ball-in-hand':
      return view(state, {
        commands: [
          ...seatCommands('pot.record', 'Record pot', 'primary'),
          ...seatCommands('miss.record', 'Record miss', 'primary'),
          ...seatCommands('foul.commit', 'Foul committed', 'secondary'),
        ],
        situationTitle: 'Ball in hand after foul',
        situationSummary: 'Record a legal pot, a miss, or another foul.',
        messages: [{ type: 'warning', text: 'Cue ball and colored balls together count as a foul.' }],
      })
    case 'respotted-black.opening':
      return view(state, {
        commands: [
          ...seatCommands('pot.record', 'Record pot', 'primary'),
          ...seatCommands('miss.record', 'Record miss', 'primary'),
          ...seatCommands('foul.commit', 'Foul committed', 'secondary'),
        ],
        situationTitle: 'Respotted black opening',
        situationSummary: 'Only the black wins. Other potted outcomes lose the frame.',
        messages: [{ type: 'hint', text: 'A black pot wins. Any other potted result is treated as a foul.' }],
      })
    case 'respotted-black.play':
      return view(state, {
        commands: [
          ...seatCommands('pot.record', 'Record pot', 'primary'),
          ...seatCommands('foul.commit', 'Foul committed', 'secondary'),
        ],
        situationTitle: 'Respotted black play',
        situationSummary: 'Record the outcome of the shot on the respotted black.',
      })
    case 'winner-determined':
      invariant(state.winner !== null, 'Winner is required before awarding a determined frame')
      return view(state, {
        commands: [
          ...seatCommands('pot.record', 'Record pot', 'primary'),
          command('frame.award', { seat: state.winner }, 'Award frame', { prominence: 'primary' }),
        ],
        seat: state.winner,
        situationTitle: 'Winner determined',
        situationSummary: 'The break may continue, or the frame can be awarded now.',
      })
    case 'frame-over':
      return view(state, {
        commands: [],
        situationTitle: 'Frame over',
        situationSummary: 'No further scoring commands are available.',
      })
  }
}

export function deriveStrilaScoreboardView(state: StrilaFrameState): StrilaScoreboardView {
  return StrilaScoreboardViewSchema.parse({
    gameKey: 'strila-v2',
    projection: 'scoreboard',
    score: state.score,
    details: {
      objectBalls: computeStrilaObjectBalls(state.coloredBallsOnTable),
      ballsRemaining: state.coloredBallsOnTable,
      pointsAvailable: computeStrilaPointsAvailable(state.coloredBallsOnTable),
      phase: state.phase,
      winner: state.winner ?? undefined,
    },
  })
}

function deriveStrilaSummaryView(state: StrilaFrameState): unknown {
  return StrilaSummaryViewSchema.parse({
    gameKey: 'strila-v2',
    projection: 'summary',
    score: state.score,
    details: {
      phase: state.phase,
    },
  })
}

function parseStrilaCommand(input: StrilaCommandEnvelope): StrilaCommand {
  if (typeof input.command !== 'object' || input.command === null) {
    return StrilaCommandSchema.parse({ type: input.commandType })
  }
  return StrilaCommandSchema.parse({ ...input.command, type: input.commandType })
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
  return StrilaFrameStateSchema.parse({
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
  if (state.phase !== 'frame-over' || state.winner === null || state.winReason === null) return undefined
  return {
    winnerSeat: state.winner,
    score: state.score,
    winReason: 'target-reached',
  }
}

export class StrilaGameplayRuntime extends GameplayRuntime {
  createInitialState(args: GameCreateStateArgs): StrilaFrameState {
    return serializeSnapshot(createInitialSnapshot(args.targetPointsBySeat))
  }

  parseState(state: unknown): StrilaFrameState {
    return StrilaFrameStateSchema.parse(state)
  }

  applyCommand(input: StrilaCommandEnvelope): { state: unknown; outcome?: FrameOutcome; protocolEntries?: unknown[] } {
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

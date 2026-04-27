import { z } from 'zod'

import { type GameCreateStateArgs, type GameProjectionKey, GameplayRuntime } from '../abstract-runtime'
import {
  STRILA_BALLS,
  StrilaControlViewSchema,
  StrilaScoreboardViewSchema,
  StrilaSummaryViewSchema,
  type StrilaControlCommand,
  type StrilaControlDetails,
  type StrilaControlView,
  type StrilaScoreboardView,
} from './definitions'
import {
  StrilaContextSchema,
  StrilaEventSchema,
  StrilaPhases,
  type StrilaColoredBall,
  type StrilaContext,
  type StrilaEvent,
  type StrilaPhase,
  type StrilaSeat,
} from './definitions2'
import {
  createInitialSnapshot,
  getPhase,
  sendEvent,
  strilaSparringMachine,
  type StrilaSparringSnapshot,
} from './machine-sparring'
import { computeStrilaObjectBalls, computeStrilaPointsAvailable } from './projections/computeds'

export const StrilaMachineFrameStateSchema = StrilaContextSchema.extend({
  phase: z.enum(StrilaPhases),
})

export type StrilaMachineFrameState = z.infer<typeof StrilaMachineFrameStateSchema>

type StrilaMachineCommandEnvelope = {
  state: unknown
  commandType: string
  command: unknown
}

function command(
  commandType: StrilaEvent['type'],
  payload: Record<string, unknown>,
  label: string,
  extras: Omit<StrilaControlCommand, 'commandType' | 'command' | 'label'>,
): StrilaControlCommand {
  return { commandType, command: payload, label, ...extras }
}

function seatCommands(commandType: StrilaEvent['type'], label: string, prominence: StrilaControlCommand['prominence']) {
  return [
    command(commandType, { actor: 'A' }, label, { prominence }),
    command(commandType, { actor: 'B' }, label, { prominence }),
  ]
}

function actorFromCommand(entry: StrilaControlCommand): StrilaSeat | null {
  const actor = entry.command.actor
  return actor === 'A' || actor === 'B' ? actor : null
}

function deriveBallStatuses(state: StrilaMachineFrameState): StrilaControlDetails['ballStatuses'] {
  const objectBalls = new Set(computeStrilaObjectBalls(state.coloredBallsOnTable))
  const onTableColored = new Set(state.coloredBallsOnTable)
  const cueStatus: 'object' | 'on-table' = state.phase === 'respotted-black.opening' ? 'on-table' : 'object'
  const ballStatuses = {} as StrilaControlDetails['ballStatuses']

  for (const ball of STRILA_BALLS) {
    if (ball === 0) {
      ballStatuses[ball] = cueStatus
      continue
    }
    if (objectBalls.has(ball)) {
      ballStatuses[ball] = 'object'
      continue
    }
    if (onTableColored.has(ball as StrilaColoredBall)) {
      ballStatuses[ball] = 'on-table'
      continue
    }
    ballStatuses[ball] = 'potted'
  }

  return ballStatuses
}

function deriveCommandSections(commands: StrilaControlCommand[]): StrilaControlDetails['commandSections'] {
  const sections: StrilaControlDetails['commandSections'] = {
    primary: { A: [], B: [] },
    secondary: { A: [], B: [] },
    tertiary: { A: [], B: [] },
  }

  commands.forEach((entry) => {
    const actor = actorFromCommand(entry)
    if (actor === null) return
    sections[entry.prominence][actor].push(entry)
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
  state: StrilaMachineFrameState,
  args: {
    commands: StrilaControlCommand[]
    situationTitle: string
    situationSummary: string
    actor?: StrilaSeat
    messages?: Array<{ type: 'hint' | 'warning'; text: string }>
  },
): StrilaControlView {
  return StrilaControlViewSchema.parse({
    gameKey: 'strila-v2',
    projection: 'control',
    score: state.score,
    details: {
      phase: state.phase,
      actor: args.actor,
      situationTitle: args.situationTitle,
      situationSummary: args.situationSummary,
      isPotCommandAvailable: args.commands.some((entry) => entry.commandType === 'pot.record'),
      ballStatuses: deriveBallStatuses(state),
      commandSections: deriveCommandSections(args.commands),
      messages: messages(args.messages ?? []),
    },
  })
}

function deriveStrilaMachineControlView(state: StrilaMachineFrameState): StrilaControlView {
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
          ...seatCommands('frame.concede', 'Concede frame', 'tertiary'),
        ],
        situationTitle: 'Open play',
        situationSummary: 'Log pots or a foul.',
      })
    case 'foul-committed.penalty-selection': {
      const chooser = state.chooser!
      return view(state, {
        commands: [
          command('penalty.select', { actor: chooser, choice: 'play-from-position' }, 'Play from position', {
            prominence: 'secondary',
            effectSummary: '+1 point',
          }),
          command('penalty.select', { actor: chooser, choice: 'pass-position' }, 'Pass position', {
            prominence: 'secondary',
            effectSummary: '+1 point',
          }),
          command('penalty.select', { actor: chooser, choice: 'ball-in-hand' }, 'Ball in hand', {
            prominence: 'secondary',
            effectSummary: 'No points awarded',
          }),
        ],
        actor: chooser,
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
          ...seatCommands('frame.concede', 'Concede frame', 'tertiary'),
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
          ...seatCommands('frame.concede', 'Concede frame', 'tertiary'),
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
          ...seatCommands('frame.concede', 'Concede frame', 'tertiary'),
        ],
        situationTitle: 'Respotted black play',
        situationSummary: 'Record the outcome of the shot on the respotted black.',
      })
    case 'winner-determined':
      return view(state, {
        commands: [
          ...seatCommands('pot.record', 'Record pot', 'primary'),
          command('frame.award', { actor: state.winner! }, 'Award frame', { prominence: 'primary' }),
        ],
        actor: state.winner!,
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

function deriveStrilaMachineScoreboardView(state: StrilaMachineFrameState): StrilaScoreboardView {
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

function deriveStrilaMachineSummaryView(state: StrilaMachineFrameState): unknown {
  return StrilaSummaryViewSchema.parse({
    gameKey: 'strila-v2',
    projection: 'summary',
    score: state.score,
    details: {
      phase: state.phase,
    },
  })
}

function parseStrilaMachineCommand(input: StrilaMachineCommandEnvelope): StrilaEvent {
  if (typeof input.command !== 'object' || input.command === null) {
    return StrilaEventSchema.parse({ type: input.commandType })
  }
  return StrilaEventSchema.parse({ ...(input.command as object), type: input.commandType })
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

function serializeSnapshot(snapshot: StrilaSparringSnapshot): StrilaMachineFrameState {
  return StrilaMachineFrameStateSchema.parse({
    ...snapshot.context,
    phase: getPhase(snapshot),
  })
}

function restoreSnapshot(state: StrilaMachineFrameState): StrilaSparringSnapshot {
  const snapshot = createInitialSnapshot(state.targetPointsBySeat)
  const { phase: _phase, ...context } = state
  return strilaSparringMachine.resolveState({
    ...snapshot,
    value: phaseToSnapshotValue(state.phase),
    context: context satisfies StrilaContext,
  })
}

export class StrilaMachineGameplayRuntime extends GameplayRuntime {
  createInitialState(args: GameCreateStateArgs): StrilaMachineFrameState {
    return serializeSnapshot(createInitialSnapshot(args.targetPointsBySeat))
  }

  parseState(state: unknown): StrilaMachineFrameState {
    return StrilaMachineFrameStateSchema.parse(state)
  }

  applyCommand(input: StrilaMachineCommandEnvelope): { state: unknown; protocolEntries?: unknown[] } {
    const previous = this.parseState(input.state)
    const command = parseStrilaMachineCommand(input)
    const next = sendEvent(restoreSnapshot(previous), command)

    return {
      state: serializeSnapshot(next),
    }
  }

  deriveProjection(args: { state: unknown; projection: GameProjectionKey }): unknown {
    const state = this.parseState(args.state)

    switch (args.projection) {
      case 'control':
        return deriveStrilaMachineControlView(state)
      case 'scoreboard':
        return deriveStrilaMachineScoreboardView(state)
      case 'summary':
        return deriveStrilaMachineSummaryView(state)
    }
  }
}

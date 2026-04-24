import {
  STRILA_BALLS,
  StrilaControlViewSchema,
  type StrilaControlCommand,
  type StrilaCommand,
  type StrilaControlDetails,
  type StrilaControlView,
  type StrilaFrameState,
  type StrilaSeat,
} from '../definitions'
import { computeStrilaObjectBalls } from './computeds'

function command(
  commandType: StrilaCommand['type'],
  payload: Record<string, unknown>,
  label: string,
  extras: Omit<StrilaControlCommand, 'commandType' | 'command' | 'label'>,
): StrilaControlCommand {
  return { commandType, command: payload, label, ...extras }
}

function opp(seat: 'A' | 'B'): 'A' | 'B' {
  return seat === 'A' ? 'B' : 'A'
}

function actorFromCommand(command: Record<string, unknown>): StrilaSeat | null {
  const actor = command.actor
  return actor === 'A' || actor === 'B' ? actor : null
}

function deriveBallStatuses(state: StrilaFrameState): StrilaControlDetails['ballStatuses'] {
  const objectBalls = new Set(computeStrilaObjectBalls(state.coloredBallsOnTable))
  const onTableColored = new Set(state.coloredBallsOnTable)
  const cueStatus: 'object' | 'on-table' = state.phase.type === 'respotted-black-opening' ? 'on-table' : 'object'
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
    if (onTableColored.has(ball)) {
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
    const actor = actorFromCommand(entry.command)
    if (!actor) return
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
  state: StrilaFrameState,
  args: {
    availableCommands: StrilaControlCommand[]
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
    availableCommands: args.availableCommands,
    details: {
      phase: state.phase.type,
      actor: args.actor,
      situationTitle: args.situationTitle,
      situationSummary: args.situationSummary,
      isPotCommandAvailable: args.availableCommands.some((entry) => entry.commandType === 'pot.record'),
      ballStatuses: deriveBallStatuses(state),
      commandSections: deriveCommandSections(args.availableCommands),
      messages: messages(args.messages ?? []),
    },
  })
}

export function deriveStrilaControlView(state: StrilaFrameState): StrilaControlView {
  switch (state.phase.type) {
    case 'not-started':
      return view(state, {
        availableCommands: [
          command('frame.commence', { actor: 'A' }, 'Break-off', { prominence: 'primary' }),
          command('frame.commence', { actor: 'B' }, 'Break-off', { prominence: 'primary' }),
        ],
        situationTitle: 'Break-off',
        situationSummary: 'Record the opening shot.',
      })

    case 'open-play':
      return view(state, {
        availableCommands: [
          command('pot.record', { actor: 'A' }, 'Record pot', { prominence: 'primary' }),
          command('pot.record', { actor: 'B' }, 'Record pot', { prominence: 'primary' }),
          command('foul.commit', { actor: 'A' }, 'Foul committed', { prominence: 'secondary' }),
          command('foul.commit', { actor: 'B' }, 'Foul committed', { prominence: 'secondary' }),
          command('frame.concede', { actor: 'A' }, 'Concede frame', { prominence: 'tertiary' }),
          command('frame.concede', { actor: 'B' }, 'Concede frame', { prominence: 'tertiary' }),
        ],
        actor: state.phase.actor,
        situationTitle: 'Open play',
        situationSummary: 'Log pots or a foul.',
      })

    case 'penalty-selection':
      return view(state, {
        availableCommands: [
          command('penalty.select', { actor: state.phase.chooser, choice: 'play-from-position' }, 'Play from position', {
            prominence: 'secondary',
            effectSummary: '+1 point',
          }),
          command('penalty.select', { actor: state.phase.chooser, choice: 'pass-position' }, 'Pass position', {
            prominence: 'secondary',
            effectSummary: '+1 point',
          }),
          command('penalty.select', { actor: state.phase.chooser, choice: 'ball-in-hand' }, 'Ball in hand', {
            prominence: 'secondary',
            effectSummary: 'No points awarded',
          }),
        ],
        actor: state.phase.chooser,
        situationTitle: 'Select penalty',
        situationSummary: 'Opponent committed a foul. Choose the response.',
      })

    case 'ball-in-hand':
      return view(state, {
        availableCommands: [
          command('pot.record', { actor: state.phase.actor }, 'Record pot', { prominence: 'primary' }),
          command('miss.record', { actor: state.phase.actor }, 'Record miss', { prominence: 'primary' }),
          command('foul.commit', { actor: state.phase.actor }, 'Foul committed', { prominence: 'secondary' }),
          command('frame.concede', { actor: state.phase.actor }, 'Concede frame', { prominence: 'tertiary' }),
          command('frame.concede', { actor: opp(state.phase.actor) }, 'Concede frame', { prominence: 'tertiary' }),
        ],
        actor: state.phase.actor,
        situationTitle: 'Ball in hand after foul',
        situationSummary: 'Record a legal pot, a miss, or another foul.',
        messages: [{ type: 'warning', text: 'Cue ball and colored balls together count as a foul.' }],
      })

    case 'respotted-black-opening':
      return view(state, {
        availableCommands: [
          command('pot.record', { actor: state.phase.actor }, 'Record pot', { prominence: 'primary' }),
          command('miss.record', { actor: state.phase.actor }, 'Record miss', { prominence: 'primary' }),
          command('foul.commit', { actor: state.phase.actor }, 'Foul committed', { prominence: 'secondary' }),
          command('frame.concede', { actor: state.phase.actor }, 'Concede frame', { prominence: 'tertiary' }),
        ],
        actor: state.phase.actor,
        situationTitle: 'Respotted black opening',
        situationSummary: 'Only the black wins. Other potted outcomes lose the frame.',
        messages: [{ type: 'hint', text: 'A black pot wins. Any other potted result is treated as a foul.' }],
      })

    case 'respotted-black-play':
      return view(state, {
        availableCommands: [
          command('pot.record', { actor: state.phase.actor }, 'Record pot', { prominence: 'primary' }),
          command('foul.commit', { actor: state.phase.actor }, 'Foul committed', { prominence: 'secondary' }),
          command('frame.concede', { actor: state.phase.actor }, 'Concede frame', { prominence: 'tertiary' }),
          command('frame.concede', { actor: opp(state.phase.actor) }, 'Concede frame', { prominence: 'tertiary' }),
        ],
        actor: state.phase.actor,
        situationTitle: 'Respotted black play',
        situationSummary: 'Record the outcome of the shot on the respotted black.',
      })

    case 'winner-determined':
      return view(state, {
        availableCommands: [
          command('pot.record', { actor: state.phase.actor }, 'Record pot', { prominence: 'primary' }),
          command('frame.award', { actor: state.phase.actor }, 'Award frame', { prominence: 'primary' }),
        ],
        actor: state.phase.actor,
        situationTitle: 'Winner determined',
        situationSummary: 'The break may continue, or the frame can be awarded now.',
      })

    case 'frame-over':
      return view(state, {
        availableCommands: [],
        situationTitle: 'Frame over',
        situationSummary: 'No further scoring commands are available.',
      })
  }
}

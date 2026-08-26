import { opponentOf, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { deriveGameCommandSections } from '../../constants'
import {
  StrilaBallStatusesSchema,
  type StrilaControlCommand,
  type StrilaControlDetails,
  type StrilaControlView,
  StrilaMeta,
} from '../definitions'
import { getPhase, type StrilaSparringFrameSnapshot } from '../machine'
import { computeStrilaObjectBalls } from './computeds'

type StrilaControlCommandInput =
  | { type: 'pot.record' | 'miss.record' | 'foul.commit' | 'frame.award'; seat: Seat }
  | { type: 'penalty.select'; seat: Seat; choice: 'play-from-position' | 'pass-position' | 'ball-in-hand' }
type StrilaSeatControlCommandType = 'pot.record' | 'miss.record' | 'foul.commit' | 'frame.award'

function command(
  command: StrilaControlCommandInput,
  extras: Omit<StrilaControlCommand, 'source' | 'commandType' | 'command' | 'seat'>,
): StrilaControlCommand {
  const { type: commandType, ...payload } = command
  return { source: 'game', commandType, command: payload, seat: command.seat, ...extras }
}

function seatCommands(commandType: StrilaSeatControlCommandType, prominence: StrilaControlCommand['prominence']) {
  return [command({ type: commandType, seat: 'A' }, { prominence }), command({ type: commandType, seat: 'B' }, { prominence })]
}

function deriveBallStatuses(snapshot: StrilaSparringFrameSnapshot): StrilaControlDetails['ballStatuses'] {
  const objectBalls = new Set(computeStrilaObjectBalls(snapshot.context.coloredBallsOnTable))
  const onTableColored = new Set(snapshot.context.coloredBallsOnTable)
  const cueStatus: 'object' | 'on-table' = getPhase(snapshot) === 'respotted-black.opening' ? 'on-table' : 'object'
  const ballStatuses = v.parse(StrilaBallStatusesSchema, {
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

function messages(entries: Array<{ type: 'hint' | 'warning'; code: 'cue-ball-and-colored-is-foul' | 'black-pot-wins' }>) {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.code)) return false
    seen.add(entry.code)
    return true
  })
}

function view(
  snapshot: StrilaSparringFrameSnapshot,
  args: {
    commands: StrilaControlCommand[]
    situationTitle: string
    situationSummary: string
    seat?: Seat
    messages?: Array<{ type: 'hint' | 'warning'; code: 'cue-ball-and-colored-is-foul' | 'black-pot-wins' }>
  },
): StrilaControlView {
  return {
    gameKey: 'strila-v2',
    projection: 'control',
    score: { ...snapshot.context.score },
    details: {
      phase: getPhase(snapshot),
      seat: args.seat,
      situationTitle: args.situationTitle,
      situationSummary: args.situationSummary,
      isPotCommandAvailable: args.commands.some((entry) => entry.commandType === 'pot.record'),
      ballStatuses: deriveBallStatuses(snapshot),
      commandSections: deriveGameCommandSections(args.commands),
      messages: messages(args.messages ?? []),
    },
  }
}

export function deriveStrilaControlView(snapshot: StrilaSparringFrameSnapshot): StrilaControlView {
  switch (getPhase(snapshot)) {
    case 'not-started':
      return view(snapshot, {
        commands: [],
        situationTitle: 'Break-off',
        situationSummary: 'Waiting for the match to open the frame.',
      })
    case 'open-play':
      return view(snapshot, {
        commands: [...seatCommands('pot.record', 'primary'), ...seatCommands('foul.commit', 'secondary')],
        situationTitle: 'Open play',
        situationSummary: 'Log pots or a foul.',
      })
    case 'foul-committed.penalty-selection': {
      invariant(snapshot.context.foulOffender !== null, 'Foul offender is required while selecting a foul penalty')
      const chooser = opponentOf(snapshot.context.foulOffender)
      return view(snapshot, {
        commands: [
          command(
            { type: 'penalty.select', seat: chooser, choice: 'play-from-position' },
            {
              prominence: 'secondary',
              effect: 'plus-one-point',
            },
          ),
          command(
            { type: 'penalty.select', seat: chooser, choice: 'pass-position' },
            {
              prominence: 'secondary',
              effect: 'plus-one-point',
            },
          ),
          command(
            { type: 'penalty.select', seat: chooser, choice: 'ball-in-hand' },
            {
              prominence: 'secondary',
              effect: 'no-points-awarded',
            },
          ),
        ],
        seat: chooser,
        situationTitle: 'Select penalty',
        situationSummary: 'Opponent committed a foul. Choose the response.',
      })
    }
    case 'foul-committed.ball-in-hand':
      return view(snapshot, {
        commands: [
          ...seatCommands('pot.record', 'primary'),
          ...seatCommands('miss.record', 'primary'),
          ...seatCommands('foul.commit', 'secondary'),
        ],
        situationTitle: 'Ball in hand after foul',
        situationSummary: 'Record a legal pot, a miss, or another foul.',
        messages: [{ type: 'warning', code: 'cue-ball-and-colored-is-foul' }],
      })
    case 'respotted-black.opening':
      return view(snapshot, {
        commands: [
          ...seatCommands('pot.record', 'primary'),
          ...seatCommands('miss.record', 'primary'),
          ...seatCommands('foul.commit', 'secondary'),
        ],
        situationTitle: 'Respotted black opening',
        situationSummary: 'Only the black wins. Other potted outcomes lose the frame.',
        messages: [{ type: 'hint', code: 'black-pot-wins' }],
      })
    case 'respotted-black.play':
      return view(snapshot, {
        commands: [...seatCommands('pot.record', 'primary'), ...seatCommands('foul.commit', 'secondary')],
        situationTitle: 'Respotted black play',
        situationSummary: 'Record the outcome of the shot on the respotted black.',
      })
    case 'winner-determined':
      invariant(snapshot.context.winner !== null, 'Winner is required before awarding a determined frame')
      return view(snapshot, {
        commands: [
          command({ type: 'pot.record', seat: snapshot.context.winner }, { prominence: 'primary' }),
          command({ type: 'frame.award', seat: snapshot.context.winner }, { prominence: 'primary' }),
        ],
        seat: snapshot.context.winner,
        situationTitle: 'Winner determined',
        situationSummary: 'The break may continue, or the frame can be awarded now.',
      })
    case 'frame-over':
      return view(snapshot, {
        commands: [],
        situationTitle: 'Frame over',
        situationSummary: 'No further scoring commands are available.',
      })
  }
}

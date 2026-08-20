import { opponentOf, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { deriveGameCommandSections } from '../../constants'
import {
  StrilaBallStatusesSchema,
  type StrilaCommand,
  type StrilaControlCommand,
  type StrilaControlDetails,
  type StrilaControlView,
  StrilaControlViewSchema,
  type StrilaFrameState,
  StrilaMeta,
} from '../definitions'
import { computeStrilaObjectBalls } from './computeds'

/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- SAFETY: REVIEW_POST_REFACTOR */
function command(
  commandType: StrilaCommand['type'],
  payload: Record<string, unknown>,
  extras: Omit<StrilaControlCommand, 'source' | 'commandType' | 'command' | 'seat'>,
): StrilaControlCommand {
  const seat = payload.seat === 'A' || payload.seat === 'B' ? payload.seat : undefined
  return { source: 'game', commandType, command: payload, seat, ...extras }
}
/* oxlint-enable anti-slop/no-unsafe-dictionary-type */

function seatCommands(commandType: StrilaCommand['type'], prominence: StrilaControlCommand['prominence']) {
  return [command(commandType, { seat: 'A' }, { prominence }), command(commandType, { seat: 'B' }, { prominence })]
}

function deriveBallStatuses(state: StrilaFrameState): StrilaControlDetails['ballStatuses'] {
  const objectBalls = new Set(computeStrilaObjectBalls(state.coloredBallsOnTable))
  const onTableColored = new Set(state.coloredBallsOnTable)
  const cueStatus: 'object' | 'on-table' = state.phase === 'respotted-black.opening' ? 'on-table' : 'object'
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
  state: StrilaFrameState,
  args: {
    commands: StrilaControlCommand[]
    situationTitle: string
    situationSummary: string
    seat?: Seat
    messages?: Array<{ type: 'hint' | 'warning'; code: 'cue-ball-and-colored-is-foul' | 'black-pot-wins' }>
  },
): StrilaControlView {
  return v.parse(StrilaControlViewSchema, {
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
      commandSections: deriveGameCommandSections(args.commands),
      messages: messages(args.messages ?? []),
    },
  })
}

export function deriveStrilaControlView(state: StrilaFrameState): StrilaControlView {
  switch (state.phase) {
    case 'not-started':
      return view(state, {
        commands: [],
        situationTitle: 'Break-off',
        situationSummary: 'Waiting for the match to open the frame.',
      })
    case 'open-play':
      return view(state, {
        commands: [...seatCommands('pot.record', 'primary'), ...seatCommands('foul.commit', 'secondary')],
        situationTitle: 'Open play',
        situationSummary: 'Log pots or a foul.',
      })
    case 'foul-committed.penalty-selection': {
      invariant(state.foulOffender !== null, 'Foul offender is required while selecting a foul penalty')
      const chooser = opponentOf(state.foulOffender)
      return view(state, {
        commands: [
          command(
            'penalty.select',
            { seat: chooser, choice: 'play-from-position' },
            {
              prominence: 'secondary',
              effect: 'plus-one-point',
            },
          ),
          command(
            'penalty.select',
            { seat: chooser, choice: 'pass-position' },
            {
              prominence: 'secondary',
              effect: 'plus-one-point',
            },
          ),
          command(
            'penalty.select',
            { seat: chooser, choice: 'ball-in-hand' },
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
      return view(state, {
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
      return view(state, {
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
      return view(state, {
        commands: [...seatCommands('pot.record', 'primary'), ...seatCommands('foul.commit', 'secondary')],
        situationTitle: 'Respotted black play',
        situationSummary: 'Record the outcome of the shot on the respotted black.',
      })
    case 'winner-determined':
      invariant(state.winner !== null, 'Winner is required before awarding a determined frame')
      return view(state, {
        commands: [
          ...seatCommands('pot.record', 'primary'),
          command('frame.award', { seat: state.winner }, { prominence: 'primary' }),
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

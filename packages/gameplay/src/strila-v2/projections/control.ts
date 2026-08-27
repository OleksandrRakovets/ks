import { opponentOf, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { deriveGameControlSections, type GameControl } from '../../constants'
import {
  StrilaBallStatusesSchema,
  type StrilaControlDetails,
  type StrilaControlView,
  StrilaMeta,
} from '../definitions'
import { getPhase, type StrilaSparringFrameSnapshot } from '../machine'
import { computeStrilaObjectBalls } from './computeds'

function seatControls(
  type: 'pot.record' | 'miss.record' | 'foul.commit',
  prominence: GameControl['prominence'],
): GameControl[] {
  return (['A', 'B'] as const).map((seat) => ({ source: 'game', type, seat, fixedInput: {}, prominence }))
}

function deriveBallStatuses(snapshot: StrilaSparringFrameSnapshot): StrilaControlDetails['ballStatuses'] {
  const objectBalls = new Set(computeStrilaObjectBalls(snapshot.context.coloredBallsOnTable))
  const onTableColored = new Set(snapshot.context.coloredBallsOnTable)
  const cueStatus: 'object' | 'on-table' =
    getPhase(snapshot) === 'respotted-black.opening' ? 'on-table' : 'object'
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

function messages(
  entries: Array<{ type: 'hint' | 'warning'; code: 'cue-ball-and-colored-is-foul' | 'black-pot-wins' }>,
) {
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
    controls: GameControl[]
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
      isPotCommandAvailable: args.controls.some((entry) => entry.type === 'pot.record'),
      ballStatuses: deriveBallStatuses(snapshot),
      controlSections: deriveGameControlSections(args.controls),
      messages: messages(args.messages ?? []),
    },
  }
}

export function deriveStrilaControlView(snapshot: StrilaSparringFrameSnapshot): StrilaControlView {
  switch (getPhase(snapshot)) {
    case 'not-started':
      return view(snapshot, {
        controls: [],
        situationTitle: 'Break-off',
        situationSummary: 'Waiting for the match to open the frame.',
      })
    case 'open-play':
      return view(snapshot, {
        controls: [...seatControls('pot.record', 'primary'), ...seatControls('foul.commit', 'secondary')],
        situationTitle: 'Open play',
        situationSummary: 'Log pots or a foul.',
      })
    case 'foul-committed.penalty-selection': {
      invariant(
        snapshot.context.foulOffender !== null,
        'Foul offender is required while selecting a foul penalty',
      )
      const chooser = opponentOf(snapshot.context.foulOffender)
      return view(snapshot, {
        controls: [
          {
            source: 'game',
            type: 'penalty.select',
            seat: chooser,
            fixedInput: { choice: 'play-from-position' },
            prominence: 'secondary',
            effect: 'plus-one-point',
          },
          {
            source: 'game',
            type: 'penalty.select',
            seat: chooser,
            fixedInput: { choice: 'pass-position' },
            prominence: 'secondary',
            effect: 'plus-one-point',
          },
          {
            source: 'game',
            type: 'penalty.select',
            seat: chooser,
            fixedInput: { choice: 'ball-in-hand' },
            prominence: 'secondary',
            effect: 'no-points-awarded',
          },
        ],
        seat: chooser,
        situationTitle: 'Select penalty',
        situationSummary: 'Opponent committed a foul. Choose the response.',
      })
    }
    case 'foul-committed.ball-in-hand':
      return view(snapshot, {
        controls: [
          ...seatControls('pot.record', 'primary'),
          ...seatControls('miss.record', 'primary'),
          ...seatControls('foul.commit', 'secondary'),
        ],
        situationTitle: 'Ball in hand after foul',
        situationSummary: 'Record a legal pot, a miss, or another foul.',
        messages: [{ type: 'warning', code: 'cue-ball-and-colored-is-foul' }],
      })
    case 'respotted-black.opening':
      return view(snapshot, {
        controls: [
          ...seatControls('pot.record', 'primary'),
          ...seatControls('miss.record', 'primary'),
          ...seatControls('foul.commit', 'secondary'),
        ],
        situationTitle: 'Respotted black opening',
        situationSummary: 'Only the black wins. Other potted outcomes lose the frame.',
        messages: [{ type: 'hint', code: 'black-pot-wins' }],
      })
    case 'respotted-black.play':
      return view(snapshot, {
        controls: [...seatControls('pot.record', 'primary'), ...seatControls('foul.commit', 'secondary')],
        situationTitle: 'Respotted black play',
        situationSummary: 'Record the outcome of the shot on the respotted black.',
      })
    case 'winner-determined':
      invariant(snapshot.context.winner !== null, 'Winner is required before awarding a determined frame')
      return view(snapshot, {
        controls: [
          {
            source: 'game',
            type: 'pot.record',
            seat: snapshot.context.winner,
            fixedInput: {},
            prominence: 'primary',
          },
          {
            source: 'game',
            type: 'frame.award',
            seat: snapshot.context.winner,
            fixedInput: {},
            prominence: 'primary',
          },
        ],
        seat: snapshot.context.winner,
        situationTitle: 'Winner determined',
        situationSummary: 'The break may continue, or the frame can be awarded now.',
      })
    case 'frame-over':
      return view(snapshot, {
        controls: [],
        situationTitle: 'Frame over',
        situationSummary: 'No further scoring commands are available.',
      })
  }
}

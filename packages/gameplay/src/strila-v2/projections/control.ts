import { opponentOf, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { type GameControl, type GameControlProjection } from '../../constants'
import {
  StrilaBallStatuses,
  type StrilaBallStatuses as StrilaBallStatusesValue,
  type StrilaGamePresentation,
  type StrilaGamePresentationDetails,
  StrilaMeta,
} from '../definitions'
import { getPhase, type StrilaSparringFrameSnapshot } from '../machine'
import { computeStrilaObjectBalls } from './computeds'
import { deriveStrilaRuleNotes } from './rule-notes'

type MutableStrilaBallStatuses = {
  -readonly [K in keyof StrilaBallStatusesValue]: StrilaBallStatusesValue[K]
}

function seatControls(
  type: 'pot.record' | 'miss.record' | 'foul.commit',
  prominence: GameControl['prominence'],
): GameControl[] {
  return (['A', 'B'] as const).map((seat) => ({ source: 'game', type, seat, fixedInput: {}, prominence }))
}

function deriveBallStatuses(
  snapshot: StrilaSparringFrameSnapshot,
): StrilaGamePresentationDetails['ballStatuses'] {
  const phase = getPhase(snapshot)

  const objectBalls = new Set(
    phase === 'not-started'
      ? snapshot.context.coloredBallsOnTable
      : computeStrilaObjectBalls(snapshot.context.coloredBallsOnTable),
  )

  const onTableColored = new Set(snapshot.context.coloredBallsOnTable)

  const cueStatus: 'object' | 'on-table' =
    phase === 'respotted-black.opening' || snapshot.context.cueBallSerialPots?.count === 2
      ? 'on-table'
      : 'object'

  const ballStatuses: MutableStrilaBallStatuses = {
    0: cueStatus,
    1: 'potted',
    2: 'potted',
    3: 'potted',
    4: 'potted',
    5: 'potted',
    6: 'potted',
    7: 'potted',
  }

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

  return v.parse(StrilaBallStatuses, ballStatuses)
}

function controlProjection(
  snapshot: StrilaSparringFrameSnapshot,
  args: {
    readonly controls: readonly GameControl[]
    readonly situationTitle: string
    readonly situationSummary: string
    readonly seat?: Seat
  },
): GameControlProjection<StrilaGamePresentation> {
  const phase = getPhase(snapshot)
  const isPotCommandAvailable = args.controls.some((entry) => entry.type === 'pot.record')

  return {
    game: {
      gameKey: 'strila-v2',
      score: { ...snapshot.context.score },
      details: {
        phase,
        seat: args.seat,
        situationTitle: args.situationTitle,
        situationSummary: args.situationSummary,
        isBallSetVisible: phase === 'not-started' || isPotCommandAvailable,
        isPotCommandAvailable,
        ballStatuses: deriveBallStatuses(snapshot),
        pottedBallsBySeat: snapshot.context.pottedBallsBySeat,
        ruleNotes: deriveStrilaRuleNotes(snapshot),
      },
    },
    controls: args.controls,
  }
}

export function deriveStrilaControlProjection(snapshot: StrilaSparringFrameSnapshot) {
  switch (getPhase(snapshot)) {
    case 'not-started':
      return controlProjection(snapshot, {
        controls: [],
        situationTitle: 'Break-off',
        situationSummary: 'Waiting for the match to open the frame.',
      })
    case 'open-play': {
      const canRecordMiss = snapshot.context.cueBallSerialPots?.count === 2

      return controlProjection(snapshot, {
        controls: [
          ...seatControls('pot.record', 'primary'),
          ...(canRecordMiss ? seatControls('miss.record', 'secondary') : []),
          ...seatControls('foul.commit', 'secondary'),
        ],
        situationTitle: 'Open play',
        situationSummary: canRecordMiss ? 'Log pots, a miss, or a foul.' : 'Log pots or a foul.',
      })
    }

    case 'foul-committed.penalty-selection': {
      invariant(
        snapshot.context.foulOffender !== null,
        'Foul offender is required while selecting a foul penalty',
      )
      const chooser = opponentOf(snapshot.context.foulOffender)

      return controlProjection(snapshot, {
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
      return controlProjection(snapshot, {
        controls: [
          ...seatControls('pot.record', 'primary'),
          ...seatControls('miss.record', 'secondary'),
          ...seatControls('foul.commit', 'secondary'),
        ],
        situationTitle: 'Ball in hand after foul',
        situationSummary: 'Record a legal pot, a miss, or another foul.',
      })
    case 'respotted-black.opening':
      return controlProjection(snapshot, {
        controls: [
          ...seatControls('pot.record', 'primary'),
          ...seatControls('miss.record', 'secondary'),
          ...seatControls('foul.commit', 'secondary'),
        ],
        situationTitle: 'Respotted black opening',
        situationSummary: 'Only the black wins. Other potted outcomes lose the frame.',
      })
    case 'respotted-black.play':
      return controlProjection(snapshot, {
        controls: [...seatControls('pot.record', 'primary'), ...seatControls('foul.commit', 'secondary')],
        situationTitle: 'Respotted black play',
        situationSummary: 'Record the outcome of the shot on the respotted black.',
      })
    case 'winner-determined': {
      invariant(snapshot.context.winner !== null, 'Winner is required before awarding a determined frame')
      const controls: GameControl[] = []

      if (snapshot.can({ type: 'pot.record', seat: snapshot.context.winner, pottedBalls: [0] })) {
        controls.push({
          source: 'game',
          type: 'pot.record',
          seat: snapshot.context.winner,
          fixedInput: {},
          prominence: 'primary',
        })
      }

      const canContinue = controls.length > 0
      controls.push({
        source: 'game',
        type: 'frame.award',
        seat: snapshot.context.winner,
        fixedInput: {},
        prominence: 'primary',
      })

      return controlProjection(snapshot, {
        controls,
        seat: snapshot.context.winner,
        situationTitle: 'Winner determined',
        situationSummary: canContinue
          ? 'The break may continue, or the frame can be awarded now.'
          : 'The frame can be awarded now.',
      })
    }

    case 'frame-over':
      return controlProjection(snapshot, {
        controls: [],
        situationTitle: 'Frame over',
        situationSummary: 'No further scoring commands are available.',
      })
  }

  throw new Error('Unsupported Strila frame phase')
}

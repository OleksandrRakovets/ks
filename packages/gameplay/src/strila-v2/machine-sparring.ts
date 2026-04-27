import { opponentOf, type BySeatNumber, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import { assign, getInitialSnapshot, getNextSnapshot, setup, type SnapshotFrom } from 'xstate'

import {
  StrilaPhaseSchema,
  StrilaMeta,
  type StrilaColoredBall,
  type StrilaContext,
  type StrilaEvent,
  type StrilaPhase,
  type StrilaWinReason,
  type StrilaBall,
} from './definitions'

const RESPOTTED_BLACK: StrilaColoredBall[] = [7]

function pointsForPottedBalls(pottedBalls: StrilaBall[]): number {
  return pottedBalls.reduce<number>((sum, ball) => sum + (ball === StrilaMeta.cueBall ? 1 : 2), 0)
}

function removePottedColoredBalls(onTable: StrilaColoredBall[], pottedBalls: StrilaBall[]): StrilaColoredBall[] {
  const potted = new Set(pottedBalls.filter((b) => b !== StrilaMeta.cueBall))
  return onTable.filter((b) => !potted.has(b))
}

function addPoints(score: BySeatNumber, seat: Seat, points: number): BySeatNumber {
  return seat === 'A' ? { A: score.A + points, B: score.B } : { A: score.A, B: score.B + points }
}

function nextCueBallSerialPots(
  prev: StrilaContext['cueBallSerialPots'],
  actor: Seat,
  pottedBalls: StrilaBall[],
): StrilaContext['cueBallSerialPots'] {
  if (!pottedBalls.includes(StrilaMeta.cueBall)) return null
  if (prev?.seat !== actor) return { seat: actor, count: 1 }
  return { seat: actor, count: prev.count >= 2 ? 2 : 2 }
}

type PotEvent = Extract<StrilaEvent, { type: 'pot.record' }>
type FoulCommitEvent = Extract<StrilaEvent, { type: 'foul.commit' }>
type PenaltySelectEvent = Extract<StrilaEvent, { type: 'penalty.select' }>
type FrameConcedeEvent = Extract<StrilaEvent, { type: 'frame.concede' }>

function potEvent(event: StrilaEvent): PotEvent {
  invariant(event.type === 'pot.record', `Expected pot.record event, received ${event.type}`)
  return event
}

function foulResponseEvent(event: StrilaEvent): PotEvent | FoulCommitEvent {
  invariant(event.type === 'pot.record' || event.type === 'foul.commit', `Expected foul response event, received ${event.type}`)
  return event
}

function foulCommitEvent(event: StrilaEvent): FoulCommitEvent {
  invariant(event.type === 'foul.commit', `Expected foul.commit event, received ${event.type}`)
  return event
}

function penaltySelectEvent(event: StrilaEvent): PenaltySelectEvent {
  invariant(event.type === 'penalty.select', `Expected penalty.select event, received ${event.type}`)
  return event
}

function frameConcedeEvent(event: StrilaEvent): FrameConcedeEvent {
  invariant(event.type === 'frame.concede', `Expected frame.concede event, received ${event.type}`)
  return event
}

function winnerFromTarget(context: StrilaContext): Seat {
  if (context.score.A >= context.targetPoints.A) return 'A'
  return 'B'
}

function outputWinner(context: StrilaContext): Seat {
  invariant(context.winner !== null, 'Winner is required for Strila machine output')
  return context.winner
}

function outputWinReason(context: StrilaContext): StrilaWinReason {
  invariant(context.winReason !== null, 'Win reason is required for Strila machine output')
  return context.winReason
}

export const strilaSparringMachine = setup({
  types: {
    context: {} as StrilaContext,
    events: {} as StrilaEvent,
    input: {} as { targetPointsBySeat?: BySeatNumber },
  },
  guards: {
    isThirdCueBallPot: ({ context, event }) => {
      const e = potEvent(event)
      return context.cueBallSerialPots?.seat === e.actor && context.cueBallSerialPots.count >= 2 && e.pottedBalls.includes(0)
    },
    isIllegalBallInHandPot: ({ event }) => {
      const e = potEvent(event)
      return e.pottedBalls.includes(0) && e.pottedBalls.some((b) => b !== 0)
    },
    isValidRespottedBlackOpeningPot: ({ event }) => {
      const e = potEvent(event)
      return e.pottedBalls.length === 1 && e.pottedBalls[0] === 7
    },
    isTargetReachedAfterPot: ({ context, event }) => {
      const e = potEvent(event)
      const next = addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls))
      return next.A >= context.targetPoints.A || next.B >= context.targetPoints.B
    },
    isRespottedBlackTrigger: ({ context, event }) => {
      const e = potEvent(event)
      const next = addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls))
      const nextBalls = removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls)
      return nextBalls.length === 0 && next.A === 8 && next.B === 8
    },
    isBallInHandChoice: ({ event }) => event.type === 'penalty.select' && event.choice === 'ball-in-hand',
    isPlayFromPositionChoice: ({ event }) => event.type === 'penalty.select' && event.choice === 'play-from-position',
    isPassPositionChoice: ({ event }) => event.type === 'penalty.select' && event.choice === 'pass-position',
    canConcede: ({ context }) => context.winner === null,
  },
  actions: {
    applyPot: assign(({ context, event }) => {
      const e = potEvent(event)
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
        cueBallSerialPots: nextCueBallSerialPots(context.cueBallSerialPots, e.actor, e.pottedBalls),
      }
    }),
    applyPotResetStreak: assign(({ context, event }) => {
      const e = potEvent(event)
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
        cueBallSerialPots: null,
      }
    }),
    applyRespottedBlackPot: assign(({ context, event }) => {
      const e = potEvent(event)
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: [],
        winner: e.actor,
        winReason: 'respotted-black-won',
      }
    }),
    setWinnerFromTarget: assign(({ context }) => ({
      winner: winnerFromTarget(context),
      winReason: 'target-reached',
    })),
    setRespottedBlackOpening: assign({
      coloredBallsOnTable: RESPOTTED_BLACK,
    }),
    setFoulResponse: assign(({ event }) => {
      const e = foulResponseEvent(event)
      return {
        foulOffender: e.actor,
      }
    }),
    setRespottedBlackOpeningFoulWinner: assign(({ event }) => {
      const e = potEvent(event)
      return {
        coloredBallsOnTable: RESPOTTED_BLACK,
        winner: opponentOf(e.actor),
        winReason: 'automatic-foul',
      }
    }),
    setFoulWinner: assign(({ event }) => {
      const e = foulCommitEvent(event)
      return {
        winner: opponentOf(e.actor),
        winReason: 'automatic-foul',
      }
    }),
    setConcedeWinner: assign(({ event }) => {
      const e = frameConcedeEvent(event)
      return {
        winner: opponentOf(e.actor),
        winReason: 'conceded',
      }
    }),
    applyBallInHand: assign(() => {
      return {
        foulOffender: null,
      }
    }),
    applyPlayFromPosition: assign(({ context, event }) => {
      const e = penaltySelectEvent(event)
      return {
        score: addPoints(context.score, e.actor, 1),
        cueBallSerialPots: null,
        foulOffender: null,
      }
    }),
    applyPassPosition: assign(({ context, event }) => {
      const e = penaltySelectEvent(event)
      return {
        score: addPoints(context.score, e.actor, 1),
        cueBallSerialPots: null,
        foulOffender: null,
      }
    }),
    switchToOpponent: assign(() => {
      return {
        cueBallSerialPots: null,
      }
    }),
    applyWinnerDeterminedPot: assign(({ context, event }) => {
      const e = potEvent(event)
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
      }
    }),
    commence: assign(() => {
      return {
        score: { A: 0, B: 0 },
        coloredBallsOnTable: [...StrilaMeta.coloredBalls],
        cueBallSerialPots: null,
      }
    }),
  },
}).createMachine({
  id: 'strila-sparring',
  initial: 'not-started',
  context: ({ input }) => ({
    score: { A: 0, B: 0 },
    targetPoints: input?.targetPointsBySeat ?? { A: 9, B: 9 },
    coloredBallsOnTable: [...StrilaMeta.coloredBalls],
    cueBallSerialPots: null,
    foulOffender: null,
    winner: null,
    winReason: null,
  }),

  states: {
    'not-started': {
      on: {
        'frame.commence': {
          target: 'open-play',
          actions: 'commence',
        },
      },
    },

    'open-play': {
      on: {
        'pot.record': [
          {
            guard: 'isThirdCueBallPot',
            target: 'foul-committed',
            actions: 'setFoulResponse',
          },
          {
            guard: 'isTargetReachedAfterPot',
            target: 'winner-determined',
            actions: ['applyPot', 'setWinnerFromTarget'],
          },
          {
            guard: 'isRespottedBlackTrigger',
            target: 'respotted-black',
            actions: ['applyPot', 'setRespottedBlackOpening'],
          },
          {
            target: 'open-play',
            actions: 'applyPot',
          },
        ],
        'foul.commit': {
          target: 'foul-committed',
          actions: 'setFoulResponse',
        },
      },
    },

    'foul-committed': {
      initial: 'penalty-selection',
      onDone: {
        target: 'open-play',
      },
      states: {
        'penalty-selection': {
          on: {
            'penalty.select': [
              {
                guard: 'isBallInHandChoice',
                target: 'ball-in-hand',
                actions: 'applyBallInHand',
              },
              {
                guard: 'isPlayFromPositionChoice',
                target: 'resolved',
                actions: 'applyPlayFromPosition',
              },
              {
                guard: 'isPassPositionChoice',
                target: 'resolved',
                actions: 'applyPassPosition',
              },
            ],
          },
        },

        'ball-in-hand': {
          on: {
            'pot.record': [
              {
                guard: 'isIllegalBallInHandPot',
                target: 'penalty-selection',
                actions: 'setFoulResponse',
              },
              {
                guard: 'isTargetReachedAfterPot',
                target: '#strila-sparring.winner-determined',
                actions: ['applyPotResetStreak', 'setWinnerFromTarget'],
              },
              {
                guard: 'isRespottedBlackTrigger',
                target: '#strila-sparring.respotted-black',
                actions: ['applyPotResetStreak', 'setRespottedBlackOpening'],
              },
              {
                target: 'resolved',
                actions: 'applyPotResetStreak',
              },
            ],
            'miss.record': {
              target: 'resolved',
              actions: 'switchToOpponent',
            },
            'foul.commit': {
              target: 'penalty-selection',
              actions: 'setFoulResponse',
            },
          },
        },

        resolved: {
          type: 'final',
        },
      },
    },

    'respotted-black': {
      initial: 'opening',
      onDone: {
        target: 'winner-determined',
      },
      on: {
        'foul.commit': {
          target: '.determined',
          actions: 'setFoulWinner',
        },
      },
      states: {
        opening: {
          on: {
            'pot.record': [
              {
                guard: 'isValidRespottedBlackOpeningPot',
                target: 'determined',
                actions: 'applyRespottedBlackPot',
              },
              {
                target: 'determined',
                actions: 'setRespottedBlackOpeningFoulWinner',
              },
            ],
            'miss.record': {
              target: 'play',
            },
          },
        },

        play: {
          on: {
            'pot.record': {
              target: 'determined',
              actions: 'applyRespottedBlackPot',
            },
          },
        },

        determined: {
          type: 'final',
        },
      },
    },

    'winner-determined': {
      on: {
        'pot.record': [
          {
            target: 'winner-determined',
            actions: 'applyWinnerDeterminedPot',
          },
        ],
        'frame.award': {
          target: 'frame-over',
        },
      },
    },

    'frame-over': {
      type: 'final',
    },
  },

  on: {
    'frame.concede': {
      guard: 'canConcede',
      target: '.winner-determined',
      actions: 'setConcedeWinner',
    },
  },

  output: ({ context }) => ({
    winner: outputWinner(context),
    winReason: outputWinReason(context),
    score: context.score,
  }),
})

export type StrilaSparringSnapshot = SnapshotFrom<typeof strilaSparringMachine>
export type StrilaSparringOutput = {
  winner: Seat
  winReason: StrilaWinReason
  score: BySeatNumber
}

export function createInitialSnapshot(targetPointsBySeat?: BySeatNumber): StrilaSparringSnapshot {
  return getInitialSnapshot(strilaSparringMachine, { targetPointsBySeat: targetPointsBySeat ?? { A: 9, B: 9 } })
}

export function getPhase(snapshot: StrilaSparringSnapshot): StrilaPhase {
  const value = snapshot.value
  if (typeof value === 'string') return StrilaPhaseSchema.parse(value)

  if ('foul-committed' in value) {
    return StrilaPhaseSchema.parse(`foul-committed.${value['foul-committed']}`)
  }

  if ('respotted-black' in value) {
    return StrilaPhaseSchema.parse(`respotted-black.${value['respotted-black']}`)
  }

  throw new Error(`Unknown Strila phase: ${JSON.stringify(value)}`)
}

export function sendEvent(snapshot: StrilaSparringSnapshot, event: StrilaEvent): StrilaSparringSnapshot {
  if (event.type === 'pot.record') {
    for (const ball of event.pottedBalls) {
      if (ball !== 0 && !snapshot.context.coloredBallsOnTable.includes(ball)) {
        throw new Error(`Potted ball ${ball} is not on the table`)
      }
    }
  }
  return getNextSnapshot(strilaSparringMachine, snapshot, event)
}

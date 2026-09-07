import { type BySeatNumber, type FrameOutcome, opponentOf, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'
import { assign, initialTransition, setup, type SnapshotFrom, transition } from 'xstate'

import {
  type StrilaBall,
  type StrilaColoredBall,
  type StrilaCommand,
  type StrilaContext,
  StrilaMeta,
  StrilaPhase,
} from './definitions'

const RESPOTTED_BLACK: readonly StrilaColoredBall[] = [7]

type StrilaSparringFrameMachineInput = {
  targetPointsBySeat?: BySeatNumber
}

const FoulSnapshotValue = v.strictObject({
  'foul-committed': v.picklist(['penalty-selection', 'ball-in-hand']),
})
const RespottedBlackSnapshotValue = v.strictObject({ 'respotted-black': v.picklist(['opening', 'play']) })
const StrilaSnapshotValue = v.union([StrilaPhase, FoulSnapshotValue, RespottedBlackSnapshotValue])

function pointsForPottedBalls(pottedBalls: readonly StrilaBall[]): number {
  return pottedBalls.reduce<number>((sum, ball) => sum + (ball === StrilaMeta.cueBall ? 1 : 2), 0)
}

function removePottedColoredBalls(
  onTable: readonly StrilaColoredBall[],
  pottedBalls: readonly StrilaBall[],
): StrilaColoredBall[] {
  const potted = new Set(pottedBalls.filter((b) => b !== StrilaMeta.cueBall))
  return onTable.filter((b) => !potted.has(b))
}

function addPoints(score: BySeatNumber, seat: Seat, points: number): BySeatNumber {
  return seat === 'A' ? { A: score.A + points, B: score.B } : { A: score.A, B: score.B + points }
}

function appendPottedBalls(
  pottedBallsBySeat: StrilaContext['pottedBallsBySeat'],
  seat: Seat,
  balls: readonly StrilaBall[],
): StrilaContext['pottedBallsBySeat'] {
  return { ...pottedBallsBySeat, [seat]: [...pottedBallsBySeat[seat], ...balls] }
}

function nextCueBallSerialPots(
  prev: StrilaContext['cueBallSerialPots'],
  seat: Seat,
  pottedBalls: readonly StrilaBall[],
): StrilaContext['cueBallSerialPots'] {
  if (!pottedBalls.includes(StrilaMeta.cueBall)) return null
  if (prev?.seat !== seat) return { seat: seat, count: 1 }
  return { seat, count: 2 }
}

type PotEvent = Extract<StrilaCommand, { type: 'pot.record' }>
type FoulCommitEvent = Extract<StrilaCommand, { type: 'foul.commit' }>
type PenaltySelectEvent = Extract<StrilaCommand, { type: 'penalty.select' }>

function potEvent(event: StrilaCommand): PotEvent {
  invariant(event.type === 'pot.record', `Expected pot.record event, received ${event.type}`)
  return event
}

function foulResponseEvent(event: StrilaCommand): PotEvent | FoulCommitEvent {
  invariant(
    event.type === 'pot.record' || event.type === 'foul.commit',
    `Expected foul response event, received ${event.type}`,
  )
  return event
}

function foulCommitEvent(event: StrilaCommand): FoulCommitEvent {
  invariant(event.type === 'foul.commit', `Expected foul.commit event, received ${event.type}`)
  return event
}

function penaltySelectEvent(event: StrilaCommand): PenaltySelectEvent {
  invariant(event.type === 'penalty.select', `Expected penalty.select event, received ${event.type}`)
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

function availableStrilaBalls(context: StrilaContext): readonly StrilaBall[] {
  return [StrilaMeta.cueBall, ...context.coloredBallsOnTable]
}

function isAvailablePot(context: StrilaContext, event: StrilaCommand): boolean {
  return (
    event.type !== 'pot.record' ||
    event.pottedBalls.every((ball) => availableStrilaBalls(context).includes(ball))
  )
}

export const StrilaSparringFrameMachine = setup({
  types: {
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    context: {} as StrilaContext,
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    events: {} as StrilaCommand,
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    input: {} as StrilaSparringFrameMachineInput,
  },
  guards: {
    isAvailablePot: ({ context, event }) => isAvailablePot(context, event),
    isTargetReached: ({ context }) =>
      context.score.A >= context.targetPoints.A || context.score.B >= context.targetPoints.B,
    isThirdCueBallPot: ({ context, event }) => {
      const e = potEvent(event)
      return (
        isAvailablePot(context, event) &&
        context.cueBallSerialPots?.seat === e.seat &&
        context.cueBallSerialPots.count >= 2 &&
        e.pottedBalls.includes(0)
      )
    },
    isIllegalBallInHandPot: ({ context, event }) => {
      const e = potEvent(event)
      return isAvailablePot(context, event) && e.pottedBalls.includes(0) && e.pottedBalls.some((b) => b !== 0)
    },
    isValidRespottedBlackOpeningPot: ({ context, event }) => {
      const e = potEvent(event)
      return isAvailablePot(context, event) && e.pottedBalls.length === 1 && e.pottedBalls[0] === 7
    },
    isTargetReachedAfterPot: ({ context, event }) => {
      const e = potEvent(event)
      if (!isAvailablePot(context, event)) return false
      const next = addPoints(context.score, e.seat, pointsForPottedBalls(e.pottedBalls))
      return next.A >= context.targetPoints.A || next.B >= context.targetPoints.B
    },
    isRespottedBlackTrigger: ({ context, event }) => {
      const e = potEvent(event)
      if (!isAvailablePot(context, event)) return false
      const next = addPoints(context.score, e.seat, pointsForPottedBalls(e.pottedBalls))
      const nextBalls = removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls)
      return nextBalls.length === 0 && next.A === next.B
    },
    isTableClearedWithLeader: ({ context, event }) => {
      const e = potEvent(event)
      if (!isAvailablePot(context, event)) return false
      const next = addPoints(context.score, e.seat, pointsForPottedBalls(e.pottedBalls))
      const nextBalls = removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls)
      return nextBalls.length === 0 && next.A !== next.B
    },
    isBallInHandChoice: ({ context, event }) =>
      event.type === 'penalty.select' &&
      context.foulOffender !== null &&
      event.seat === opponentOf(context.foulOffender) &&
      event.choice === 'ball-in-hand',
    isPlayFromPositionChoice: ({ context, event }) =>
      event.type === 'penalty.select' &&
      context.foulOffender !== null &&
      event.seat === opponentOf(context.foulOffender) &&
      event.choice === 'play-from-position',
    isPassPositionChoice: ({ context, event }) =>
      event.type === 'penalty.select' &&
      context.foulOffender !== null &&
      event.seat === opponentOf(context.foulOffender) &&
      event.choice === 'pass-position',
    isSeatWinner: ({ context, event }) => {
      if (event.type !== 'pot.record') return false
      return (
        context.winnerDeterminationReason !== 'table-cleared' &&
        isAvailablePot(context, event) &&
        context.winner === event.seat
      )
    },
    isAwardForWinner: ({ context, event }) => {
      if (event.type !== 'frame.award') return false
      return context.winner === event.seat
    },
  },
  actions: {
    applyPot: assign(({ context, event }) => {
      const e = potEvent(event)
      return {
        score: addPoints(context.score, e.seat, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
        pottedBallsBySeat: appendPottedBalls(context.pottedBallsBySeat, e.seat, e.pottedBalls),
        cueBallSerialPots: nextCueBallSerialPots(context.cueBallSerialPots, e.seat, e.pottedBalls),
      }
    }),
    applyRespottedBlackPot: assign(({ context, event }) => {
      const e = potEvent(event)
      return {
        score: addPoints(context.score, e.seat, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: [],
        pottedBallsBySeat: appendPottedBalls(context.pottedBallsBySeat, e.seat, e.pottedBalls),
        winner: e.seat,
        winnerDeterminationReason: 'respotted-black-won',
      }
    }),
    setWinnerFromTarget: assign(({ context }) => ({
      winner: winnerFromTarget(context),
      winnerDeterminationReason: 'target-reached',
    })),
    setWinnerFromClearedTable: assign(({ context }) => ({
      winner: context.score.A > context.score.B ? 'A' : 'B',
      winnerDeterminationReason: 'table-cleared',
    })),
    setRespottedBlackOpening: assign({
      coloredBallsOnTable: RESPOTTED_BLACK,
      cueBallSerialPots: null,
    }),
    setFoulResponse: assign(({ event }) => {
      const e = foulResponseEvent(event)
      return {
        cueBallSerialPots: null,
        foulOffender: e.seat,
      }
    }),
    setRespottedBlackOpeningFoulWinner: assign(({ event }) => {
      const e = potEvent(event)
      return {
        coloredBallsOnTable: RESPOTTED_BLACK,
        winner: opponentOf(e.seat),
        winnerDeterminationReason: 'automatic-foul',
      }
    }),
    setFoulWinner: assign(({ event }) => {
      const e = foulCommitEvent(event)
      return {
        winner: opponentOf(e.seat),
        winnerDeterminationReason: 'automatic-foul',
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
        score: addPoints(context.score, e.seat, 1),
        foulOffender: null,
      }
    }),
    applyPassPosition: assign(({ context, event }) => {
      const e = penaltySelectEvent(event)
      return {
        score: addPoints(context.score, e.seat, 1),
        foulOffender: null,
      }
    }),
    clearCueBallStreak: assign(() => {
      return {
        cueBallSerialPots: null,
      }
    }),
    applyWinnerDeterminedPot: assign(({ context, event }) => {
      const e = potEvent(event)
      return {
        score: addPoints(context.score, e.seat, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
        pottedBallsBySeat: appendPottedBalls(context.pottedBallsBySeat, e.seat, e.pottedBalls),
      }
    }),
    commence: assign(() => {
      return {
        score: { A: 0, B: 0 },
        coloredBallsOnTable: [...StrilaMeta.coloredBalls],
        pottedBallsBySeat: { A: [], B: [] },
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
    pottedBallsBySeat: { A: [], B: [] },
    cueBallSerialPots: null,
    foulOffender: null,
    winner: null,
    winnerDeterminationReason: null,
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
            target: 'foul-committed.ball-in-hand',
            actions: ['clearCueBallStreak', 'applyBallInHand'],
          },
          // A legal target-reaching shot wins even when clearing the table leaves a tie or a higher opponent score.
          {
            guard: 'isTargetReachedAfterPot',
            target: 'winner-determined',
            actions: ['applyPot', 'setWinnerFromTarget'],
          },
          {
            guard: 'isTableClearedWithLeader',
            target: 'winner-determined',
            actions: ['applyPot', 'setWinnerFromClearedTable'],
          },
          {
            guard: 'isRespottedBlackTrigger',
            target: 'respotted-black',
            actions: ['applyPot', 'setRespottedBlackOpening'],
          },
          {
            guard: 'isAvailablePot',
            target: 'open-play',
            actions: 'applyPot',
          },
        ],
        'foul.commit': {
          target: 'foul-committed',
          actions: 'setFoulResponse',
        },
        'miss.record': {
          target: 'open-play',
          actions: 'clearCueBallStreak',
        },
      },
    },

    'foul-committed': {
      initial: 'penalty-selection',
      onDone: [
        {
          guard: 'isTargetReached',
          target: 'winner-determined',
          actions: 'setWinnerFromTarget',
        },
        { target: 'open-play' },
      ],
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
                target: 'ball-in-hand',
                actions: ['clearCueBallStreak', 'applyBallInHand'],
              },
              {
                guard: 'isTargetReachedAfterPot',
                target: '#strila-sparring.winner-determined',
                actions: ['applyPot', 'setWinnerFromTarget'],
              },
              {
                guard: 'isTableClearedWithLeader',
                target: '#strila-sparring.winner-determined',
                actions: ['applyPot', 'setWinnerFromClearedTable'],
              },
              {
                guard: 'isRespottedBlackTrigger',
                target: '#strila-sparring.respotted-black',
                actions: ['applyPot', 'setRespottedBlackOpening'],
              },
              {
                guard: 'isAvailablePot',
                target: 'resolved',
                actions: 'applyPot',
              },
            ],
            'miss.record': {
              target: 'resolved',
              actions: 'clearCueBallStreak',
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
                guard: 'isAvailablePot',
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
              guard: 'isAvailablePot',
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
        'pot.record': {
          guard: 'isSeatWinner',
          target: 'winner-determined',
          actions: 'applyWinnerDeterminedPot',
        },
        'frame.award': {
          guard: 'isAwardForWinner',
          target: 'frame-over',
        },
      },
    },

    'frame-over': {
      type: 'final',
    },
  },

  output: ({ context }): FrameOutcome => ({
    winnerSeat: outputWinner(context),
    score: { ...context.score },
    winReason: 'game-rules',
  }),
})

export type StrilaSparringFrameSnapshot = SnapshotFrom<typeof StrilaSparringFrameMachine>

export function createInitialSnapshot(targetPointsBySeat: BySeatNumber): StrilaSparringFrameSnapshot {
  const [snapshot] = initialTransition(StrilaSparringFrameMachine, { targetPointsBySeat })
  return snapshot
}

export function getStrilaSparringFramePhase(snapshot: StrilaSparringFrameSnapshot): StrilaPhase {
  return getPhase(snapshot)
}

export function getPhase(snapshot: StrilaSparringFrameSnapshot): StrilaPhase {
  const value = v.parse(StrilaSnapshotValue, snapshot.value)
  const phase = v.safeParse(StrilaPhase, value)
  if (phase.success) return phase.output

  const foul = v.safeParse(FoulSnapshotValue, value)
  if (foul.success) return v.parse(StrilaPhase, `foul-committed.${foul.output['foul-committed']}`)

  const respottedBlack = v.safeParse(RespottedBlackSnapshotValue, value)
  if (respottedBlack.success)
    return v.parse(StrilaPhase, `respotted-black.${respottedBlack.output['respotted-black']}`)

  throw new Error(`Unknown Strila phase: ${JSON.stringify(value)}`)
}

export function sendEvent(
  snapshot: StrilaSparringFrameSnapshot,
  event: StrilaCommand,
): StrilaSparringFrameSnapshot {
  if (!snapshot.can(event)) {
    throw new Error(`Invalid Strila event ${event.type} in phase ${getPhase(snapshot)}`)
  }

  const [nextSnapshot] = transition(StrilaSparringFrameMachine, snapshot, event)
  return nextSnapshot
}

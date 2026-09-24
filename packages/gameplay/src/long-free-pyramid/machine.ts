import { type BySeatNumber, type FrameOutcome, opponentOf, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'
import { assign, initialTransition, setup, type SnapshotFrom, transition } from 'xstate'

import {
  applyFoulToRacks,
  applyPotToRacks,
  ballsOnTableFromRacks,
  maybeRollRacks,
  targetReachedBySeat,
  totalScore,
  zeroScore,
} from './calculations'
import {
  type LongFreePyramidCommand,
  type LongFreePyramidContext,
  LongFreePyramidPhase,
  type LongFreePyramidRack,
} from './definitions'

type LongFreePyramidMachineInput = {
  readonly targetPointsBySeat: BySeatNumber
  readonly rackRollover: 14 | 15
}

type PotEvent = Extract<LongFreePyramidCommand, { type: 'pot.record' }>

type FoulCommitEvent = Extract<LongFreePyramidCommand, { type: 'foul.commit' }>

type FrameAwardEvent = Extract<LongFreePyramidCommand, { type: 'frame.award' }>

const VALID_POTTED_BALL_COUNTS = [1, 2, 3, 4] as const

function requireRackRollover(rackRollover: number): 14 | 15 {
  invariant(rackRollover === 14 || rackRollover === 15, 'Long free pyramid requires rackRollover 14 or 15')

  return rackRollover
}

function potEvent(event: LongFreePyramidCommand): PotEvent {
  invariant(event.type === 'pot.record', `Expected pot.record event, received ${event.type}`)

  return event
}

function foulCommitEvent(event: LongFreePyramidCommand): FoulCommitEvent {
  invariant(event.type === 'foul.commit', `Expected foul.commit event, received ${event.type}`)

  return event
}

function frameAwardEvent(event: LongFreePyramidCommand): FrameAwardEvent {
  invariant(event.type === 'frame.award', `Expected frame.award event, received ${event.type}`)

  return event
}

function isValidPottedBallCount(pottedBallCount: number): pottedBallCount is 1 | 2 | 3 | 4 {
  return VALID_POTTED_BALL_COUNTS.some((option) => option === pottedBallCount)
}

function finalizeScoringUpdate(args: {
  readonly racks: readonly LongFreePyramidRack[]
  readonly rackRollover: 14 | 15
  readonly phase: LongFreePyramidPhase
  readonly winner: Seat | null
}): Pick<LongFreePyramidContext, 'racks' | 'messages' | 'winner'> {
  const rolled = maybeRollRacks({
    racks: args.racks,
    rackRollover: args.rackRollover,
    phase: args.phase,
  })

  return {
    racks: rolled.racks,
    messages: rolled.messages,
    winner: args.winner,
  }
}

export const LongFreePyramidFrameMachine = setup({
  types: {
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    context: {} as LongFreePyramidContext,
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    events: {} as LongFreePyramidCommand,
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    input: {} as LongFreePyramidMachineInput,
  },
  guards: {
    isValidPotWithinTable: ({ context, event }) => {
      const e = potEvent(event)

      if (!isValidPottedBallCount(e.pottedBallCount)) return false

      return e.pottedBallCount <= ballsOnTableFromRacks(context.racks)
    },
    isValidWinnerPotWithinTable: ({ context, event }) => {
      const e = potEvent(event)

      if (context.winner !== e.seat) return false

      if (!isValidPottedBallCount(e.pottedBallCount)) return false

      return e.pottedBallCount <= ballsOnTableFromRacks(context.racks)
    },
    isCurrentRackHasBall: ({ context }) => ballsOnTableFromRacks(context.racks) >= 1,
    isWinnerFoulWithBall: ({ context, event }) => {
      if (event.type !== 'foul.commit') return false

      return context.winner === event.seat && ballsOnTableFromRacks(context.racks) >= 1
    },
    isOpenPlayPotReachingTarget: ({ context, event }) => {
      const e = potEvent(event)

      if (
        !isValidPottedBallCount(e.pottedBallCount) ||
        e.pottedBallCount > ballsOnTableFromRacks(context.racks)
      )
        return false
      const racks = applyPotToRacks(context.racks, e.seat, e.pottedBallCount)
      const score = totalScore(racks)

      return targetReachedBySeat(score, context.targetPoints, e.seat)
    },
    isOpenPlayFoulReachingTarget: ({ context, event }) => {
      const e = foulCommitEvent(event)

      if (ballsOnTableFromRacks(context.racks) < 1) return false
      const awardedSeat = opponentOf(e.seat)
      const racks = applyFoulToRacks(context.racks, awardedSeat)
      const score = totalScore(racks)

      return targetReachedBySeat(score, context.targetPoints, awardedSeat)
    },
    isAwardForWinner: ({ context, event }) => {
      const e = frameAwardEvent(event)

      return context.winner === e.seat
    },
  },
  actions: {
    applyOpenPlayPot: assign(({ context, event }) => {
      const e = potEvent(event)
      const racks = applyPotToRacks(context.racks, e.seat, e.pottedBallCount)

      return finalizeScoringUpdate({
        racks,
        rackRollover: context.rackRollover,
        phase: 'open-play',
        winner: context.winner,
      })
    }),
    applyOpenPlayPotAndSetWinner: assign(({ context, event }) => {
      const e = potEvent(event)
      const racks = applyPotToRacks(context.racks, e.seat, e.pottedBallCount)

      return finalizeScoringUpdate({
        racks,
        rackRollover: context.rackRollover,
        phase: 'winner-determined',
        winner: e.seat,
      })
    }),
    applyWinnerPot: assign(({ context, event }) => {
      const e = potEvent(event)
      const racks = applyPotToRacks(context.racks, e.seat, e.pottedBallCount)

      return finalizeScoringUpdate({
        racks,
        rackRollover: context.rackRollover,
        phase: 'winner-determined',
        winner: context.winner,
      })
    }),
    applyOpenPlayFoul: assign(({ context, event }) => {
      const e = foulCommitEvent(event)
      const awardedSeat = opponentOf(e.seat)
      const racks = applyFoulToRacks(context.racks, awardedSeat)

      return finalizeScoringUpdate({
        racks,
        rackRollover: context.rackRollover,
        phase: 'open-play',
        winner: context.winner,
      })
    }),
    applyOpenPlayFoulAndSetWinner: assign(({ context, event }) => {
      const e = foulCommitEvent(event)
      const awardedSeat = opponentOf(e.seat)
      const racks = applyFoulToRacks(context.racks, awardedSeat)

      return finalizeScoringUpdate({
        racks,
        rackRollover: context.rackRollover,
        phase: 'awaiting-award',
        winner: awardedSeat,
      })
    }),
    applyWinnerFoul: assign(({ context, event }) => {
      const e = foulCommitEvent(event)
      const awardedSeat = opponentOf(e.seat)
      const racks = applyFoulToRacks(context.racks, awardedSeat)

      return finalizeScoringUpdate({
        racks,
        rackRollover: context.rackRollover,
        phase: 'awaiting-award',
        winner: context.winner,
      })
    }),
  },
}).createMachine({
  id: 'long-free-pyramid-frame',
  initial: 'not-started',
  context: ({ input }) => ({
    racks: [{ rackNumber: 1, scoreBySeat: zeroScore() }],
    targetPoints: input.targetPointsBySeat,
    rackRollover: requireRackRollover(input.rackRollover),
    winner: null,
    messages: [],
  }),

  states: {
    'not-started': {
      on: {
        'frame.commence': 'open-play',
      },
    },

    'open-play': {
      on: {
        'pot.record': [
          {
            guard: 'isOpenPlayPotReachingTarget',
            target: 'winner-determined',
            actions: 'applyOpenPlayPotAndSetWinner',
          },
          {
            guard: 'isValidPotWithinTable',
            target: 'open-play',
            actions: 'applyOpenPlayPot',
          },
        ],
        'foul.commit': [
          {
            guard: 'isOpenPlayFoulReachingTarget',
            target: 'awaiting-award',
            actions: 'applyOpenPlayFoulAndSetWinner',
          },
          {
            guard: 'isCurrentRackHasBall',
            target: 'open-play',
            actions: 'applyOpenPlayFoul',
          },
        ],
      },
    },

    'winner-determined': {
      on: {
        'pot.record': {
          guard: 'isValidWinnerPotWithinTable',
          target: 'winner-determined',
          actions: 'applyWinnerPot',
        },
        'foul.commit': {
          guard: 'isWinnerFoulWithBall',
          target: 'awaiting-award',
          actions: 'applyWinnerFoul',
        },
        'frame.award': {
          guard: 'isAwardForWinner',
          target: 'frame-over',
        },
      },
    },

    'awaiting-award': {
      on: {
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

  output: ({ context }): FrameOutcome => {
    invariant(context.winner !== null, 'Winner is required for LongFreePyramid machine output')

    return {
      winnerSeat: context.winner,
      winReason: 'game-rules' as const,
      score: totalScore(context.racks),
    }
  },
})

export type LongFreePyramidFrameSnapshot = SnapshotFrom<typeof LongFreePyramidFrameMachine>

export function createInitialSnapshot(input: LongFreePyramidMachineInput): LongFreePyramidFrameSnapshot {
  const [snapshot] = initialTransition(LongFreePyramidFrameMachine, input)

  return snapshot
}

export function getLongFreePyramidFramePhase(snapshot: LongFreePyramidFrameSnapshot): LongFreePyramidPhase {
  return getPhase(snapshot)
}

export function getPhase(snapshot: LongFreePyramidFrameSnapshot): LongFreePyramidPhase {
  return v.parse(LongFreePyramidPhase, snapshot.value)
}

export function sendEvent(
  snapshot: LongFreePyramidFrameSnapshot,
  event: LongFreePyramidCommand,
): LongFreePyramidFrameSnapshot {
  if (!snapshot.can(event)) {
    throw new Error(`Invalid Long free pyramid event ${event.type} in phase ${getPhase(snapshot)}`)
  }

  const [nextSnapshot] = transition(LongFreePyramidFrameMachine, snapshot, event)

  return nextSnapshot
}

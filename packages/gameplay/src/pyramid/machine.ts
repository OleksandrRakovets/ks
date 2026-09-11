import { type BySeatNumber, type FrameOutcome, opponentOf, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'
import { assign, initialTransition, setup, type SnapshotFrom, transition } from 'xstate'

import { type PyramidCommand, type PyramidContext, PyramidPhase } from './definitions'
import type { PyramidRules } from './rules'

type PyramidMachineInput = {
  targetPointsBySeat: BySeatNumber
  rules: PyramidRules
}

type PotEvent = Extract<PyramidCommand, { type: 'pot.record' }>

type FoulCommitEvent = Extract<PyramidCommand, { type: 'foul.commit' }>

type FrameAwardEvent = Extract<PyramidCommand, { type: 'frame.award' }>

function potEvent(event: PyramidCommand): PotEvent {
  invariant(event.type === 'pot.record', `Expected pot.record event, received ${event.type}`)

  return event
}

function foulCommitEvent(event: PyramidCommand): FoulCommitEvent {
  invariant(event.type === 'foul.commit', `Expected foul.commit event, received ${event.type}`)

  return event
}

function frameAwardEvent(event: PyramidCommand): FrameAwardEvent {
  invariant(event.type === 'frame.award', `Expected frame.award event, received ${event.type}`)

  return event
}

function clamp(value: number, allowNegative: boolean): number {
  return allowNegative ? value : Math.max(0, value)
}

function setSeat(score: BySeatNumber, seat: Seat, value: number): BySeatNumber {
  return seat === 'A' ? { A: value, B: score.B } : { A: score.A, B: value }
}

function applyShot(
  score: BySeatNumber,
  seat: Seat,
  pottedBallCount: number,
  allowNegative: boolean,
): BySeatNumber {
  return setSeat(score, seat, clamp(score[seat] + pottedBallCount, allowNegative))
}

function applyFoul(score: BySeatNumber, offender: Seat, rules: PyramidRules): BySeatNumber {
  if (rules.foulPenalty === 'opponent-plus-one') {
    const target = opponentOf(offender)

    return setSeat(score, target, score[target] + 1)
  }

  return setSeat(score, offender, clamp(score[offender] - 1, rules.allowNegative))
}

function targetReached(score: BySeatNumber, target: BySeatNumber): Seat | null {
  if (score.A >= target.A) return 'A'

  if (score.B >= target.B) return 'B'

  return null
}

function outputWinner(context: PyramidContext): Seat {
  invariant(context.winner !== null, 'Winner is required for Pyramid machine output')

  return context.winner
}

export const PyramidSparringFrameMachine = setup({
  types: {
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    context: {} as PyramidContext,
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    events: {} as PyramidCommand,
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    input: {} as PyramidMachineInput,
  },
  guards: {
    isAllowedPottedBallCount: ({ context, event }) => {
      const e = potEvent(event)

      return context.rules.shotPointOptions.includes(e.pottedBallCount)
    },
    isAllowedPottedBallCountAndTargetReachedAfterPot: ({ context, event }) => {
      const e = potEvent(event)

      if (!context.rules.shotPointOptions.includes(e.pottedBallCount)) return false
      const next = applyShot(context.score, e.seat, e.pottedBallCount, context.rules.allowNegative)

      return targetReached(next, context.targetPoints) !== null
    },
    isTargetReachedAfterFoul: ({ context, event }) => {
      const e = foulCommitEvent(event)
      const next = applyFoul(context.score, e.seat, context.rules)

      return targetReached(next, context.targetPoints) !== null
    },
    isAwardForLeader: ({ context, event }) => {
      const e = frameAwardEvent(event)

      return context.winner === e.seat
    },
    isSeatWinner: ({ context, event }) => {
      if (event.type === 'frame.commence' || event.type === 'frame.award') return false

      return context.winner === event.seat
    },
    isSeatWinnerWithAllowedPottedBallCount: ({ context, event }) => {
      const e = potEvent(event)

      return context.winner === e.seat && context.rules.shotPointOptions.includes(e.pottedBallCount)
    },
  },
  actions: {
    commence: assign(() => ({
      score: { A: 0, B: 0 },
    })),
    applyPot: assign(({ context, event }) => {
      const e = potEvent(event)

      return {
        score: applyShot(context.score, e.seat, e.pottedBallCount, context.rules.allowNegative),
      }
    }),
    applyPotAndSetWinner: assign(({ context, event }) => {
      const e = potEvent(event)
      const score = applyShot(context.score, e.seat, e.pottedBallCount, context.rules.allowNegative)
      const winner = targetReached(score, context.targetPoints)
      invariant(winner !== null, 'Pot did not reach target')

      return {
        score,
        winner,
      }
    }),
    applyFoul: assign(({ context, event }) => {
      const e = foulCommitEvent(event)

      return {
        score: applyFoul(context.score, e.seat, context.rules),
      }
    }),
    applyFoulAndSetWinner: assign(({ context, event }) => {
      const e = foulCommitEvent(event)
      const score = applyFoul(context.score, e.seat, context.rules)
      const winner = targetReached(score, context.targetPoints)
      invariant(winner !== null, 'Foul did not reach target')

      return {
        score,
        winner,
      }
    }),
  },
}).createMachine({
  id: 'pyramid-sparring',
  initial: 'not-started',
  context: ({ input }) => ({
    score: { A: 0, B: 0 },
    targetPoints: input.targetPointsBySeat,
    rules: input.rules,
    winner: null,
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
            guard: 'isAllowedPottedBallCountAndTargetReachedAfterPot',
            target: 'winner-determined',
            actions: 'applyPotAndSetWinner',
          },
          {
            guard: 'isAllowedPottedBallCount',
            target: 'open-play',
            actions: 'applyPot',
          },
        ],
        'foul.commit': [
          {
            guard: 'isTargetReachedAfterFoul',
            target: 'winner-determined',
            actions: 'applyFoulAndSetWinner',
          },
          {
            target: 'open-play',
            actions: 'applyFoul',
          },
        ],
      },
    },

    'winner-determined': {
      on: {
        'pot.record': {
          guard: 'isSeatWinnerWithAllowedPottedBallCount',
          target: 'winner-determined',
          actions: 'applyPot',
        },
        'foul.commit': {
          guard: 'isSeatWinner',
          target: 'winner-determined',
          actions: 'applyFoul',
        },
        'frame.award': {
          guard: 'isAwardForLeader',
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
    winReason: 'game-rules' as const,
    score: { ...context.score },
  }),
})

export type PyramidSparringFrameSnapshot = SnapshotFrom<typeof PyramidSparringFrameMachine>

export function createInitialSnapshot(
  rules: PyramidRules,
  targetPointsBySeat: BySeatNumber,
): PyramidSparringFrameSnapshot {
  const [snapshot] = initialTransition(PyramidSparringFrameMachine, { targetPointsBySeat, rules })

  return snapshot
}

export function getPyramidSparringFramePhase(snapshot: PyramidSparringFrameSnapshot): PyramidPhase {
  return getPhase(snapshot)
}

export function getPhase(snapshot: PyramidSparringFrameSnapshot): PyramidPhase {
  return v.parse(PyramidPhase, snapshot.value)
}

export function sendEvent(
  snapshot: PyramidSparringFrameSnapshot,
  event: PyramidCommand,
): PyramidSparringFrameSnapshot {
  if (!snapshot.can(event)) {
    throw new Error(`Invalid Pyramid event ${event.type} in phase ${getPhase(snapshot)}`)
  }

  const [nextSnapshot] = transition(PyramidSparringFrameMachine, snapshot, event)

  return nextSnapshot
}

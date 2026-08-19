import { opponentOf, type BySeatNumber, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'
import { assign, initialTransition, setup, transition, type SnapshotFrom } from 'xstate'

type PyramidWinReason = 'target-reached'

export type PyramidPhase = 'not-started' | 'open-play' | 'winner-determined' | 'frame-over'

type PyramidFoulPenalty = 'opponent-plus-one' | 'offender-minus-one'

export type PyramidRules = {
  allowNegative: boolean
  foulPenalty: PyramidFoulPenalty
}

type PyramidContext = {
  score: BySeatNumber
  targetPoints: BySeatNumber
  rules: PyramidRules
  winner: Seat | null
  winReason: PyramidWinReason | null
}

type PyramidMachineInput = {
  targetPointsBySeat: BySeatNumber
  rules: PyramidRules
}

const PyramidPhaseSchema = v.picklist(['not-started', 'open-play', 'winner-determined', 'frame-over'])

export type PyramidEvent =
  | { type: 'frame.commence'; actor: Seat }
  | { type: 'pot.record'; actor: Seat; points: number }
  | { type: 'foul.commit'; actor: Seat }
  | { type: 'frame.award'; actor: Seat }

type PotEvent = Extract<PyramidEvent, { type: 'pot.record' }>
type FoulCommitEvent = Extract<PyramidEvent, { type: 'foul.commit' }>
type FrameAwardEvent = Extract<PyramidEvent, { type: 'frame.award' }>

function potEvent(event: PyramidEvent): PotEvent {
  invariant(event.type === 'pot.record', `Expected pot.record event, received ${event.type}`)
  return event
}

function foulCommitEvent(event: PyramidEvent): FoulCommitEvent {
  invariant(event.type === 'foul.commit', `Expected foul.commit event, received ${event.type}`)
  return event
}

function frameAwardEvent(event: PyramidEvent): FrameAwardEvent {
  invariant(event.type === 'frame.award', `Expected frame.award event, received ${event.type}`)
  return event
}

function clamp(value: number, allowNegative: boolean): number {
  return allowNegative ? value : Math.max(0, value)
}

function setSeat(score: BySeatNumber, seat: Seat, value: number): BySeatNumber {
  return seat === 'A' ? { A: value, B: score.B } : { A: score.A, B: value }
}

function applyShot(score: BySeatNumber, seat: Seat, points: number, allowNegative: boolean): BySeatNumber {
  return setSeat(score, seat, clamp(score[seat] + points, allowNegative))
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

function outputWinReason(context: PyramidContext): PyramidWinReason {
  invariant(context.winReason !== null, 'Win reason is required for Pyramid machine output')
  return context.winReason
}

export const pyramidSparringMachine = setup({
  types: {
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    context: {} as PyramidContext,
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    events: {} as PyramidEvent,
    // SAFETY: XState's setup API uses empty values solely to capture these compile-time contracts.
    input: {} as PyramidMachineInput,
  },
  guards: {
    isTargetReachedAfterPot: ({ context, event }) => {
      const e = potEvent(event)
      const next = applyShot(context.score, e.actor, e.points, context.rules.allowNegative)
      return targetReached(next, context.targetPoints) !== null
    },
    isTargetReachedAfterFoul: ({ context, event }) => {
      const e = foulCommitEvent(event)
      const next = applyFoul(context.score, e.actor, context.rules)
      return targetReached(next, context.targetPoints) !== null
    },
    isAwardForLeader: ({ context, event }) => {
      const e = frameAwardEvent(event)
      return context.winner === e.actor
    },
    isActorWinner: ({ context, event }) => context.winner === event.actor,
  },
  actions: {
    commence: assign(() => ({
      score: { A: 0, B: 0 },
    })),
    applyPot: assign(({ context, event }) => {
      const e = potEvent(event)
      return {
        score: applyShot(context.score, e.actor, e.points, context.rules.allowNegative),
      }
    }),
    applyPotAndSetWinner: assign(({ context, event }) => {
      const e = potEvent(event)
      const score = applyShot(context.score, e.actor, e.points, context.rules.allowNegative)
      const winner = targetReached(score, context.targetPoints)
      invariant(winner !== null, 'Pot did not reach target')
      return {
        score,
        winner,
        winReason: 'target-reached' as const,
      }
    }),
    applyFoul: assign(({ context, event }) => {
      const e = foulCommitEvent(event)
      return {
        score: applyFoul(context.score, e.actor, context.rules),
      }
    }),
    applyFoulAndSetWinner: assign(({ context, event }) => {
      const e = foulCommitEvent(event)
      const score = applyFoul(context.score, e.actor, context.rules)
      const winner = targetReached(score, context.targetPoints)
      invariant(winner !== null, 'Foul did not reach target')
      return {
        score,
        winner,
        winReason: 'target-reached' as const,
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
            guard: 'isTargetReachedAfterPot',
            target: 'winner-determined',
            actions: 'applyPotAndSetWinner',
          },
          {
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
          guard: 'isActorWinner',
          target: 'winner-determined',
          actions: 'applyPot',
        },
        'foul.commit': {
          guard: 'isActorWinner',
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

  output: ({ context }) => ({
    winner: outputWinner(context),
    winReason: outputWinReason(context),
    score: context.score,
  }),
})

export type PyramidSparringSnapshot = SnapshotFrom<typeof pyramidSparringMachine>

export function createInitialSnapshot(rules: PyramidRules, targetPointsBySeat: BySeatNumber): PyramidSparringSnapshot {
  const [snapshot] = initialTransition(pyramidSparringMachine, { targetPointsBySeat, rules })
  return snapshot
}

export function getPhase(snapshot: PyramidSparringSnapshot): PyramidPhase {
  return v.parse(PyramidPhaseSchema, snapshot.value)
}

export function sendEvent(snapshot: PyramidSparringSnapshot, event: PyramidEvent): PyramidSparringSnapshot {
  const [nextSnapshot] = transition(pyramidSparringMachine, snapshot, event)
  return nextSnapshot
}

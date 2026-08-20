import { type BySeatNumber, type FrameOutcome, type Seat } from '@ks/core'
import * as v from 'valibot'
import { type Actor, assign, createActor, setup, type SnapshotFrom } from 'xstate'

type CompletedFrame = {
  frameIndex: number
  score: BySeatNumber
  winnerSeat: Seat
  winReason: FrameOutcome['winReason']
}

type MatchContext = {
  frameTargetPointsBySeat: BySeatNumber
  matchTargetFrames: number
  framesWonBySeat: BySeatNumber
  frames: CompletedFrame[]
  currentFrameIndex: number
  matchWinner: Seat | null
}

type MatchEvent =
  | { type: 'match.setup'; frameTargetPointsBySeat: BySeatNumber; matchTargetFrames: number }
  | { type: 'frame.start' }
  | { type: 'frame.completed'; outcome: FrameOutcome }
  | { type: 'match.end' }

type MatchInput = {
  frameTargetPointsBySeat?: BySeatNumber
  matchTargetFrames?: number
}

function matchWinnerFromScore(score: BySeatNumber, target: number): Seat | null {
  const aWon = score.A >= target
  const bWon = score.B >= target

  if (aWon && !bWon) return 'A'
  if (bWon && !aWon) return 'B'
  return null
}

function scoreAfterOutcome(context: MatchContext, outcome: FrameOutcome): BySeatNumber {
  return {
    A: context.framesWonBySeat.A + (outcome.winnerSeat === 'A' ? 1 : 0),
    B: context.framesWonBySeat.B + (outcome.winnerSeat === 'B' ? 1 : 0),
  }
}

export const matchSparringMachine = setup({
  types: {
    // SAFETY: XState reads this assertion value only to capture the declared context contract.
    context: {} as MatchContext,
    // SAFETY: XState reads this assertion value only to capture the declared event contract.
    events: {} as MatchEvent,
    // SAFETY: XState reads this assertion value only to capture the declared input contract.
    input: {} as MatchInput,
  },
  guards: {
    canStartFrame: ({ context }) => matchWinnerFromScore(context.framesWonBySeat, context.matchTargetFrames) === null,
    isMatchTargetReachedByOutcome: ({ context, event }) => {
      if (event.type !== 'frame.completed') return false
      return matchWinnerFromScore(scoreAfterOutcome(context, event.outcome), context.matchTargetFrames) !== null
    },
  },
  actions: {
    applySetup: assign(({ event }) => {
      if (event.type !== 'match.setup') throw new Error('Expected match.setup')
      return {
        frameTargetPointsBySeat: event.frameTargetPointsBySeat,
        matchTargetFrames: event.matchTargetFrames,
      }
    }),
    recordCompletedFrame: assign(({ context, event }) => {
      if (event.type !== 'frame.completed') throw new Error('Expected frame.completed')
      const { outcome } = event
      return {
        framesWonBySeat: {
          A: context.framesWonBySeat.A + (outcome.winnerSeat === 'A' ? 1 : 0),
          B: context.framesWonBySeat.B + (outcome.winnerSeat === 'B' ? 1 : 0),
        },
        frames: [
          ...context.frames,
          {
            frameIndex: context.currentFrameIndex,
            score: outcome.score,
            winnerSeat: outcome.winnerSeat,
            winReason: outcome.winReason,
          },
        ],
        currentFrameIndex: context.currentFrameIndex + 1,
      }
    }),
    setMatchWinner: assign(({ context, event }) => {
      const score = event.type === 'frame.completed' ? scoreAfterOutcome(context, event.outcome) : context.framesWonBySeat
      const winner = matchWinnerFromScore(score, context.matchTargetFrames)
      if (winner === null) throw new Error('Match has no winner')

      return {
        matchWinner: winner,
      }
    }),
  },
}).createMachine({
  id: 'match-sparring',
  initial: 'idle',
  context: ({ input }) => ({
    frameTargetPointsBySeat: input?.frameTargetPointsBySeat ?? { A: 9, B: 9 },
    matchTargetFrames: input?.matchTargetFrames ?? 3,
    framesWonBySeat: { A: 0, B: 0 },
    frames: [],
    currentFrameIndex: 1,
    matchWinner: null,
  }),

  states: {
    idle: {
      on: {
        'match.setup': {
          target: 'between-frames',
          actions: 'applySetup',
        },
      },
    },

    'between-frames': {
      on: {
        'frame.start': {
          guard: 'canStartFrame',
          target: 'frame-in-progress',
        },
      },
    },

    'frame-in-progress': {
      on: {
        'frame.completed': [
          {
            guard: 'isMatchTargetReachedByOutcome',
            target: 'match-point-reached',
            actions: ['recordCompletedFrame', 'setMatchWinner'],
          },
          {
            target: 'between-frames',
            actions: 'recordCompletedFrame',
          },
        ],
      },
    },

    'match-point-reached': {
      on: {
        'match.end': {
          target: 'match-over',
        },
      },
    },

    'match-over': {
      type: 'final',
    },
  },
})

export type MatchSparringSnapshot = SnapshotFrom<typeof matchSparringMachine>
export type MatchSparringActor = Actor<typeof matchSparringMachine>

export function getMatchPhase(snapshot: MatchSparringSnapshot): string {
  const stateName = v.safeParse(v.string(), snapshot.value)
  return stateName.success ? stateName.output : JSON.stringify(snapshot.value)
}

export function createMatchActor(input?: MatchInput): MatchSparringActor {
  const actor = createActor(matchSparringMachine, { input: input ?? {} })
  actor.start()
  return actor
}

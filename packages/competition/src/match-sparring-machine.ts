import { strilaSparringMachine, type StrilaSparringOutput } from '@ks/gameplay/strila-v2/machine-sparring'
import type { StrilaEvent } from '@ks/gameplay/strila-v2/definitions2'
import { assign, createActor, sendTo, setup, type SnapshotFrom, type Actor } from 'xstate'

type Seat = 'A' | 'B'

type CompletedFrame = {
  frameIndex: number
  score: { A: number; B: number }
  winner: Seat
}

type MatchContext = {
  frameTargetPointsBySeat: { A: number; B: number }
  matchTargetFrames: number
  framesWonBySeat: { A: number; B: number }
  frames: CompletedFrame[]
  currentFrameIndex: number
  matchWinner: Seat | null
}

// Match-level events. StrilaEvents are forwarded to the active frame child.
type MatchEvent =
  | { type: 'match.setup'; frameTargetPointsBySeat: { A: number; B: number }; matchTargetFrames: number }
  | { type: 'frame.start' }
  | { type: 'match.end' }
  | StrilaEvent

export const matchSparringMachine = setup({
  types: {
    context: {} as MatchContext,
    events: {} as MatchEvent,
    input: {} as {
      frameTargetPointsBySeat?: { A: number; B: number }
      matchTargetFrames?: number
    },
  },
  actors: {
    frame: strilaSparringMachine,
  },
  guards: {
    isMatchTargetReached: ({ context, event }) => {
      // Guard fires before recordCompletedFrame, so we look ahead using event.output
      const e = event as unknown as { output: StrilaSparringOutput }
      const winner = e.output.winner
      return context.framesWonBySeat[winner] + 1 >= context.matchTargetFrames
    },
  },
  actions: {
    applySetup: assign(({ event }) => {
      const e = event as Extract<MatchEvent, { type: 'match.setup' }>
      return {
        frameTargetPointsBySeat: e.frameTargetPointsBySeat,
        matchTargetFrames: e.matchTargetFrames,
      }
    }),
    recordCompletedFrame: assign(({ context, event }) => {
      const e = event as unknown as { output: StrilaSparringOutput }
      const winner = e.output.winner
      return {
        framesWonBySeat: {
          A: context.framesWonBySeat.A + (winner === 'A' ? 1 : 0),
          B: context.framesWonBySeat.B + (winner === 'B' ? 1 : 0),
        },
        frames: [
          ...context.frames,
          {
            frameIndex: context.currentFrameIndex,
            score: e.output.score,
            winner,
          },
        ],
        currentFrameIndex: context.currentFrameIndex + 1,
      }
    }),
    setMatchWinner: assign(({ context }) => ({
      matchWinner: context.framesWonBySeat.A >= context.matchTargetFrames ? ('A' as Seat) : ('B' as Seat),
    })),
    forwardToFrame: sendTo('currentFrame', ({ event }) => event as StrilaEvent),
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
          target: 'frame-in-progress',
        },
        'match.end': {
          target: 'match-over',
          actions: 'setMatchWinner',
        },
      },
    },

    'frame-in-progress': {
      invoke: {
        id: 'currentFrame',
        src: 'frame',
        input: ({ context }) => ({ targetPointsBySeat: context.frameTargetPointsBySeat }),
        onDone: [
          {
            guard: 'isMatchTargetReached',
            target: 'match-over',
            actions: ['recordCompletedFrame', 'setMatchWinner'],
          },
          {
            target: 'between-frames',
            actions: 'recordCompletedFrame',
          },
        ],
      },
      on: {
        'frame.commence': { actions: 'forwardToFrame' },
        'pot.record': { actions: 'forwardToFrame' },
        'miss.record': { actions: 'forwardToFrame' },
        'foul.commit': { actions: 'forwardToFrame' },
        'penalty.select': { actions: 'forwardToFrame' },
        'frame.award': { actions: 'forwardToFrame' },
        'frame.concede': { actions: 'forwardToFrame' },
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
  return typeof snapshot.value === 'string' ? snapshot.value : JSON.stringify(snapshot.value)
}

export function createMatchActor(input?: {
  frameTargetPointsBySeat?: { A: number; B: number }
  matchTargetFrames?: number
}): MatchSparringActor {
  const actor = createActor(matchSparringMachine, { input: input ?? {} })
  actor.start()
  return actor
}

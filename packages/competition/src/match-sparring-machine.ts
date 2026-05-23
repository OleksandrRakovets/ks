import { type BySeatNumber, type Seat } from '@ks/core'
import { StrilaGameplayRuntime, type StrilaEvent, type StrilaFrameState } from '@ks/gameplay'
import { assign, createActor, setup, type Actor, type SnapshotFrom } from 'xstate'

type CompletedFrame = {
  frameIndex: number
  score: BySeatNumber
  winner: Seat
}

type MatchContext = {
  frameTargetPointsBySeat: BySeatNumber
  matchTargetFrames: number
  framesWonBySeat: BySeatNumber
  frames: CompletedFrame[]
  currentFrameIndex: number
  currentFrame: StrilaFrameState | null
  matchWinner: Seat | null
}

type MatchEvent =
  | { type: 'match.setup'; frameTargetPointsBySeat: BySeatNumber; matchTargetFrames: number }
  | { type: 'frame.start' }
  | { type: 'match.end' }
  | StrilaEvent

const frameRuntime = new StrilaGameplayRuntime()

function currentFrameWinner(context: MatchContext): Seat {
  const winner = context.currentFrame?.winner
  if (winner === null || winner === undefined) throw new Error('Current frame has no winner')
  return winner
}

function scoreWithCurrentFrame(context: MatchContext): BySeatNumber {
  const currentWinner = context.currentFrame?.winner
  return {
    A: context.framesWonBySeat.A + (currentWinner === 'A' ? 1 : 0),
    B: context.framesWonBySeat.B + (currentWinner === 'B' ? 1 : 0),
  }
}

function matchWinnerFromScore(score: BySeatNumber, target: number): Seat | null {
  const aWon = score.A >= target
  const bWon = score.B >= target

  if (aWon && !bWon) return 'A'
  if (bWon && !aWon) return 'B'
  return null
}

export const matchSparringMachine = setup({
  types: {
    context: {} as MatchContext,
    events: {} as MatchEvent,
    input: {} as {
      frameTargetPointsBySeat?: BySeatNumber
      matchTargetFrames?: number
    },
  },
  guards: {
    isCurrentFrameOver: ({ context }) => context.currentFrame?.phase === 'frame-over',
    isMatchTargetReached: ({ context }) => {
      if (context.currentFrame?.winner === null || context.currentFrame?.winner === undefined) return false
      return matchWinnerFromScore(scoreWithCurrentFrame(context), context.matchTargetFrames) !== null
    },
    hasMatchWinner: ({ context }) => matchWinnerFromScore(scoreWithCurrentFrame(context), context.matchTargetFrames) !== null,
  },
  actions: {
    applySetup: assign(({ event }) => {
      const e = event as Extract<MatchEvent, { type: 'match.setup' }>
      return {
        frameTargetPointsBySeat: e.frameTargetPointsBySeat,
        matchTargetFrames: e.matchTargetFrames,
      }
    }),
    startFrame: assign(({ context }) => ({
      currentFrame: frameRuntime.createInitialState({ targetPointsBySeat: context.frameTargetPointsBySeat }),
    })),
    applyFrameCommand: assign(({ context, event }) => {
      if (context.currentFrame === null) throw new Error('No current frame')
      return {
        currentFrame: frameRuntime.applyCommand({
          state: context.currentFrame,
          commandType: event.type,
          command: event,
        }).state as StrilaFrameState,
      }
    }),
    recordCompletedFrame: assign(({ context }) => {
      if (context.currentFrame === null) throw new Error('No current frame')
      const winner = currentFrameWinner(context)
      return {
        framesWonBySeat: {
          A: context.framesWonBySeat.A + (winner === 'A' ? 1 : 0),
          B: context.framesWonBySeat.B + (winner === 'B' ? 1 : 0),
        },
        frames: [
          ...context.frames,
          {
            frameIndex: context.currentFrameIndex,
            score: context.currentFrame.score,
            winner,
          },
        ],
        currentFrameIndex: context.currentFrameIndex + 1,
        currentFrame: null,
      }
    }),
    setMatchWinner: assign(({ context }) => {
      const winner = matchWinnerFromScore(scoreWithCurrentFrame(context), context.matchTargetFrames)
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
    currentFrame: null,
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
          actions: 'startFrame',
        },
        'match.end': {
          guard: 'hasMatchWinner',
          target: 'match-over',
          actions: 'setMatchWinner',
        },
      },
    },

    'frame-in-progress': {
      always: [
        {
          guard: 'isMatchTargetReached',
          target: 'match-over',
          actions: ['setMatchWinner', 'recordCompletedFrame'],
        },
        {
          guard: 'isCurrentFrameOver',
          target: 'between-frames',
          actions: 'recordCompletedFrame',
        },
      ],
      on: {
        'frame.commence': { actions: 'applyFrameCommand' },
        'pot.record': { actions: 'applyFrameCommand' },
        'miss.record': { actions: 'applyFrameCommand' },
        'foul.commit': { actions: 'applyFrameCommand' },
        'penalty.select': { actions: 'applyFrameCommand' },
        'frame.award': { actions: 'applyFrameCommand' },
        'frame.concede': { actions: 'applyFrameCommand' },
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
  frameTargetPointsBySeat?: BySeatNumber
  matchTargetFrames?: number
}): MatchSparringActor {
  const actor = createActor(matchSparringMachine, { input: input ?? {} })
  actor.start()
  return actor
}

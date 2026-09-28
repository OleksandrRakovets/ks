import { BySeatNumber, FrameOutcome, MatchConfig, opponentOf, Seat } from '@ks/core'
import * as v from 'valibot'
import { assign, initialTransition, setup, type SnapshotFrom, transition } from 'xstate'

export const MatchMachineCheckpoint = v.object({
  value: v.picklist(['between-frames', 'frame-in-progress', 'finished']),
  context: v.object({
    config: MatchConfig,
    completedFrames: v.pipe(
      v.array(
        v.object({
          frameIndex: v.pipe(v.number(), v.integer(), v.minValue(1)),
          breakerSeat: Seat,
          outcome: FrameOutcome,
        }),
      ),
      v.readonly(),
    ),
    framesWonBySeat: BySeatNumber,
    nextFrameIndex: v.pipe(v.number(), v.integer(), v.minValue(1)),
    activeFrame: v.nullable(
      v.object({ frameIndex: v.pipe(v.number(), v.integer(), v.minValue(1)), breakerSeat: Seat }),
    ),
    winnerSeat: v.nullable(Seat),
  }),
})

export type MatchMachineCheckpoint = v.InferOutput<typeof MatchMachineCheckpoint>

type CompletedFrame = MatchMachineContext['completedFrames'][number]

type ActiveFrame = NonNullable<MatchMachineContext['activeFrame']>

type MatchLifecycleStateBase = {
  readonly config: MatchConfig
  readonly completedFrames: readonly CompletedFrame[]
  readonly framesWonBySeat: BySeatNumber
}

export type MatchLifecycleState =
  | (MatchLifecycleStateBase & {
      readonly phase: 'between-frames'
      readonly nextFrameIndex: number
    })
  | (MatchLifecycleStateBase & {
      readonly phase: 'frame-in-progress'
      readonly nextFrameIndex: number
      readonly activeFrame: ActiveFrame
    })
  | (MatchLifecycleStateBase & {
      readonly phase: 'finished'
      readonly winnerSeat: Seat
    })

export type MatchMachineContext = MatchMachineCheckpoint['context']

export function restoreLifecycleSnapshot(checkpoint: MatchMachineCheckpoint): MatchSnapshot {
  const { value, context } = checkpoint
  const wins = { A: 0, B: 0 }

  for (const [index, frame] of context.completedFrames.entries()) {
    if (
      frame.frameIndex !== index + 1 ||
      frame.breakerSeat !== expectedBreakerSeat(context.config, frame.frameIndex)
    )
      throw new Error('Invalid completed frame sequence')
    wins[frame.outcome.winnerSeat]++
  }

  if (
    wins.A !== context.framesWonBySeat.A ||
    wins.B !== context.framesWonBySeat.B ||
    context.nextFrameIndex !== context.completedFrames.length + 1 ||
    (value === 'frame-in-progress') !== (context.activeFrame !== null) ||
    (context.activeFrame !== null &&
      (context.activeFrame.frameIndex !== context.nextFrameIndex ||
        context.activeFrame.breakerSeat !== expectedBreakerSeat(context.config, context.nextFrameIndex))) ||
    (value === 'finished') !== (context.winnerSeat !== null) ||
    (value === 'finished' &&
      (context.winnerSeat === null ||
        wins[context.winnerSeat] < context.config.targets.matchTargetFrames ||
        context.completedFrames.at(-1)?.outcome.winnerSeat !== context.winnerSeat)) ||
    (value !== 'finished' &&
      (wins.A >= context.config.targets.matchTargetFrames ||
        wins.B >= context.config.targets.matchTargetFrames))
  )
    throw new Error('Inconsistent match lifecycle checkpoint')

  return MatchMachine.resolveState({ value, context })
}

export type MatchLifecycleEvent =
  | {
      readonly type: 'frame.prepared'
      readonly frameIndex: number
      readonly breakerSeat: Seat
    }
  | {
      readonly type: 'frame.completed'
      readonly frameIndex: number
      readonly outcome: FrameOutcome
    }

const MatchPhase = v.picklist(['between-frames', 'frame-in-progress', 'finished'])

export type MatchPhase = v.InferOutput<typeof MatchPhase>

function expectedBreakerSeat(config: MatchConfig, frameIndex: number): Seat {
  return frameIndex % 2 === 1 ? config.firstBreakerSeat : opponentOf(config.firstBreakerSeat)
}

function winsAfterOutcome(framesWonBySeat: BySeatNumber, outcome: FrameOutcome): BySeatNumber {
  return {
    A: framesWonBySeat.A + (outcome.winnerSeat === 'A' ? 1 : 0),
    B: framesWonBySeat.B + (outcome.winnerSeat === 'B' ? 1 : 0),
  }
}

function isMatchTargetReached(
  framesWonBySeat: BySeatNumber,
  matchTargetFrames: number,
  winnerSeat: Seat,
): boolean {
  return framesWonBySeat[winnerSeat] >= matchTargetFrames
}

export const MatchMachine = setup({
  types: {
    // SAFETY: XState reads this assertion value only to capture the declared context contract.
    context: {} as MatchMachineContext,
    // SAFETY: XState reads this assertion value only to capture the declared event contract.
    events: {} as MatchLifecycleEvent,
    // SAFETY: XState reads this assertion value only to capture the declared input contract.
    input: {} as MatchConfig,
  },
  guards: {
    isValidFramePrepare: ({ context, event }) => {
      if (event.type !== 'frame.prepared') return false

      return (
        event.frameIndex === context.nextFrameIndex &&
        event.breakerSeat === expectedBreakerSeat(context.config, event.frameIndex)
      )
    },
    isValidFrameComplete: ({ context, event }) => {
      if (event.type !== 'frame.completed') return false

      return context.activeFrame?.frameIndex === event.frameIndex
    },
    isMatchWinningFrameComplete: ({ context, event }) => {
      if (event.type !== 'frame.completed') return false

      if (context.activeFrame?.frameIndex !== event.frameIndex) return false
      const nextWins = winsAfterOutcome(context.framesWonBySeat, event.outcome)

      return isMatchTargetReached(nextWins, context.config.targets.matchTargetFrames, event.outcome.winnerSeat)
    },
  },
  actions: {
    activateFrame: assign(({ event }) => {
      if (event.type !== 'frame.prepared') throw new Error('Expected frame.prepared')

      return {
        activeFrame: {
          frameIndex: event.frameIndex,
          breakerSeat: event.breakerSeat,
        },
      }
    }),
    recordCompletedFrame: assign(({ context, event }) => {
      if (event.type !== 'frame.completed') throw new Error('Expected frame.completed')
      const activeFrame = context.activeFrame

      if (!activeFrame) throw new Error('No active frame to complete')

      const { outcome } = event

      return {
        completedFrames: [
          ...context.completedFrames,
          {
            frameIndex: activeFrame.frameIndex,
            breakerSeat: activeFrame.breakerSeat,
            outcome,
          },
        ],
        framesWonBySeat: winsAfterOutcome(context.framesWonBySeat, outcome),
        activeFrame: null,
        nextFrameIndex: context.nextFrameIndex + 1,
      }
    }),
    setWinner: assign(({ event }) => {
      if (event.type !== 'frame.completed') throw new Error('Expected frame.completed')

      return {
        winnerSeat: event.outcome.winnerSeat,
      }
    }),
  },
}).createMachine({
  id: 'match',
  initial: 'between-frames',
  context: ({ input }) => ({
    config: input,
    completedFrames: [],
    framesWonBySeat: { A: 0, B: 0 },
    nextFrameIndex: 1,
    activeFrame: null,
    winnerSeat: null,
  }),
  states: {
    'between-frames': {
      on: {
        'frame.prepared': {
          guard: 'isValidFramePrepare',
          target: 'frame-in-progress',
          actions: 'activateFrame',
        },
      },
    },
    'frame-in-progress': {
      on: {
        'frame.completed': [
          {
            guard: 'isMatchWinningFrameComplete',
            target: 'finished',
            actions: ['recordCompletedFrame', 'setWinner'],
          },
          {
            guard: 'isValidFrameComplete',
            target: 'between-frames',
            actions: 'recordCompletedFrame',
          },
        ],
      },
    },
    finished: {
      type: 'final',
    },
  },
})

export type MatchSnapshot = SnapshotFrom<typeof MatchMachine>

export function getMatchPhase(snapshot: MatchSnapshot): MatchPhase {
  return getPhase(snapshot)
}

export function createInitialSnapshot(config: MatchConfig): MatchSnapshot {
  const [snapshot] = initialTransition(MatchMachine, config)

  return snapshot
}

function getPhase(snapshot: MatchSnapshot): MatchPhase {
  return v.parse(MatchPhase, snapshot.value)
}

export function deriveLifecycleState(snapshot: MatchSnapshot): MatchLifecycleState {
  const phase = getPhase(snapshot)
  const context = snapshot.context

  const base = {
    config: context.config,
    completedFrames: context.completedFrames,
    framesWonBySeat: context.framesWonBySeat,
  }

  switch (phase) {
    case 'between-frames':
      return {
        ...base,
        phase,
        nextFrameIndex: context.nextFrameIndex,
      }
    case 'frame-in-progress':
      return {
        ...base,
        phase,
        nextFrameIndex: context.nextFrameIndex,
        activeFrame: context.activeFrame!,
      }
    case 'finished':
      return {
        ...base,
        phase,
        winnerSeat: context.winnerSeat!,
      }
  }

  throw new Error('Unsupported match phase')
}

export function sendLifecycleEvent(snapshot: MatchSnapshot, event: MatchLifecycleEvent): MatchSnapshot {
  const phase = getPhase(snapshot)

  if (!snapshot.can(event)) {
    throw new Error(`Invalid match lifecycle event ${event.type} in phase ${phase}`)
  }

  const [nextSnapshot] = transition(MatchMachine, snapshot, event)

  if (nextSnapshot === snapshot) {
    throw new Error(`Invalid match lifecycle event ${event.type} in phase ${phase}`)
  }

  return nextSnapshot
}

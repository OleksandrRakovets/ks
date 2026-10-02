import { BySeatNumber, FrameOutcome, opponentOf, PositiveInteger, Seat } from '@ks/core'
import { Schema } from 'effect'
import { assign, initialTransition, setup, type SnapshotFrom, transition } from 'xstate'

import { MatchConfig } from './definitions'

export const MatchPhase = Schema.Literals(['between-frames', 'frame-in-progress', 'finished'])

export const MatchMachineCheckpoint = Schema.Struct({
  value: MatchPhase,
  context: Schema.Struct({
    config: MatchConfig,
    completedFrames: Schema.Array(
      Schema.Struct({
        frameIndex: PositiveInteger,
        breakerSeat: Seat,
        outcome: FrameOutcome,
      }),
    ),
    framesWonBySeat: BySeatNumber,
    nextFrameIndex: PositiveInteger,
    activeFrame: Schema.NullOr(Schema.Struct({ frameIndex: PositiveInteger, breakerSeat: Seat })),
    winnerSeat: Schema.NullOr(Seat),
  }),
})

type CompletedFrame = (typeof MatchMachineCheckpoint.Type)['context']['completedFrames'][number]

type ActiveFrame = NonNullable<(typeof MatchMachineCheckpoint.Type)['context']['activeFrame']>

type MatchLifecycleStateBase = {
  readonly config: typeof MatchConfig.Type
  readonly completedFrames: readonly CompletedFrame[]
  readonly framesWonBySeat: typeof BySeatNumber.Type
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
      readonly winnerSeat: typeof Seat.Type
    })

export type MatchLifecycleEvent = {
  readonly type: 'frame.completed'
  readonly frameIndex: number
  readonly outcome: typeof FrameOutcome.Type
}

const MatchMachine = setup({
  types: {
    // SAFETY: XState reads this assertion value only to capture the declared context contract.
    context: {} as (typeof MatchMachineCheckpoint.Type)['context'],
    // SAFETY: XState reads this assertion value only to capture the declared event contract.
    events: {} as MatchLifecycleEvent,
    // SAFETY: XState reads this assertion value only to capture the declared input contract.
    input: {} as typeof MatchConfig.Type,
  },
  guards: {
    isValidFrameComplete: ({ context, event }) => context.activeFrame?.frameIndex === event.frameIndex,
    isMatchWinningFrameComplete: ({ context, event }) => {
      if (context.activeFrame?.frameIndex !== event.frameIndex) return false
      const nextWins = winsAfterOutcome(context.framesWonBySeat, event.outcome)

      return isMatchTargetReached(nextWins, context.config.targets.matchTargetFrames, event.outcome.winnerSeat)
    },
  },
  actions: {
    activateFrame: assign(({ context }) => ({
      activeFrame: {
        frameIndex: context.nextFrameIndex,
        breakerSeat: expectedBreakerSeat(context.config, context.nextFrameIndex),
      },
    })),
    recordCompletedFrame: assign(({ context, event }) => {
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
    setWinner: assign(({ event }) => ({ winnerSeat: event.outcome.winnerSeat })),
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
      always: {
        target: 'frame-in-progress',
        actions: 'activateFrame',
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

export function createInitialSnapshot(config: typeof MatchConfig.Type): MatchSnapshot {
  const [snapshot] = initialTransition(MatchMachine, config)

  return snapshot
}

export function restoreLifecycleSnapshot(checkpoint: typeof MatchMachineCheckpoint.Type): MatchSnapshot {
  const { value, context } = checkpoint

  if (value === 'between-frames') throw new Error('Cannot restore a transient match phase')

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

export function deriveLifecycleState(snapshot: MatchSnapshot): MatchLifecycleState {
  const phase = getMatchPhase(snapshot)
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
  const phase = getMatchPhase(snapshot)

  if (!snapshot.can(event)) {
    throw new Error(`Invalid match lifecycle event ${event.type} in phase ${phase}`)
  }

  const [nextSnapshot] = transition(MatchMachine, snapshot, event)

  if (nextSnapshot === snapshot) {
    throw new Error(`Invalid match lifecycle event ${event.type} in phase ${phase}`)
  }

  return nextSnapshot
}

function getMatchPhase(snapshot: MatchSnapshot): typeof MatchPhase.Type {
  return Schema.decodeUnknownSync(MatchPhase)(snapshot.value)
}

function expectedBreakerSeat(config: typeof MatchConfig.Type, frameIndex: number): typeof Seat.Type {
  return frameIndex % 2 === 1 ? config.firstBreakerSeat : opponentOf(config.firstBreakerSeat)
}

function winsAfterOutcome(
  framesWonBySeat: typeof BySeatNumber.Type,
  outcome: typeof FrameOutcome.Type,
): typeof BySeatNumber.Type {
  return {
    A: framesWonBySeat.A + (outcome.winnerSeat === 'A' ? 1 : 0),
    B: framesWonBySeat.B + (outcome.winnerSeat === 'B' ? 1 : 0),
  }
}

function isMatchTargetReached(
  framesWonBySeat: typeof BySeatNumber.Type,
  matchTargetFrames: number,
  winnerSeat: typeof Seat.Type,
): boolean {
  return framesWonBySeat[winnerSeat] >= matchTargetFrames
}

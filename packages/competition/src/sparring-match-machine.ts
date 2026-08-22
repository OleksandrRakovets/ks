import {
  type BySeatNumber,
  BySeatNumberSchema,
  type FrameOutcome,
  type MatchConfig,
  opponentOf,
  type Seat,
  SeatSchema,
} from '@ks/core'
import * as v from 'valibot'
import { type Actor, assign, createActor, initialTransition, setup, type SnapshotFrom, transition } from 'xstate'

export type CompletedSparringFrame = {
  readonly frameIndex: number
  readonly breakerSeat: Seat
  readonly outcome: FrameOutcome
}

export type ActiveSparringFrame = {
  readonly frameIndex: number
  readonly breakerSeat: Seat
}

type SparringMatchLifecycleStateBase = {
  readonly config: MatchConfig
  readonly completedFrames: readonly CompletedSparringFrame[]
  readonly framesWonBySeat: BySeatNumber
}

export type SparringMatchLifecycleState =
  | (SparringMatchLifecycleStateBase & {
      readonly phase: 'between-frames'
      readonly nextFrameIndex: number
    })
  | (SparringMatchLifecycleStateBase & {
      readonly phase: 'frame-in-progress'
      readonly nextFrameIndex: number
      readonly activeFrame: ActiveSparringFrame
    })
  | (SparringMatchLifecycleStateBase & {
      readonly phase: 'match-over'
      readonly winnerSeat: Seat
    })

export type SparringMatchMachineContext = {
  readonly config: MatchConfig
  readonly completedFrames: readonly CompletedSparringFrame[]
  readonly framesWonBySeat: BySeatNumber
  readonly nextFrameIndex: number
  readonly activeFrame: ActiveSparringFrame | null
  readonly winnerSeat: Seat | null
}

export type SparringMatchLifecycleEvent =
  | {
      readonly type: 'frame.started'
      readonly frameIndex: number
      readonly breakerSeat: Seat
    }
  | {
      readonly type: 'frame.completed'
      readonly frameIndex: number
      readonly outcome: FrameOutcome
    }

export const SparringMatchPhaseSchema = v.picklist(['between-frames', 'frame-in-progress', 'match-over'])
export type SparringMatchPhase = v.InferOutput<typeof SparringMatchPhaseSchema>

function expectedBreakerSeat(config: MatchConfig, frameIndex: number): Seat {
  return frameIndex % 2 === 1 ? config.firstBreakerSeat : opponentOf(config.firstBreakerSeat)
}

function winsAfterOutcome(framesWonBySeat: BySeatNumber, outcome: FrameOutcome): BySeatNumber {
  return {
    A: framesWonBySeat.A + (outcome.winnerSeat === 'A' ? 1 : 0),
    B: framesWonBySeat.B + (outcome.winnerSeat === 'B' ? 1 : 0),
  }
}

function isMatchTargetReached(framesWonBySeat: BySeatNumber, matchTargetFrames: number, winnerSeat: Seat): boolean {
  return framesWonBySeat[winnerSeat] >= matchTargetFrames
}

export const SparringMatchMachine = setup({
  types: {
    // SAFETY: XState reads this assertion value only to capture the declared context contract.
    context: {} as SparringMatchMachineContext,
    // SAFETY: XState reads this assertion value only to capture the declared event contract.
    events: {} as SparringMatchLifecycleEvent,
    // SAFETY: XState reads this assertion value only to capture the declared input contract.
    input: {} as MatchConfig,
  },
  guards: {
    isValidFrameStart: ({ context, event }) => {
      if (event.type !== 'frame.started') return false
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
      if (event.type !== 'frame.started') throw new Error('Expected frame.started')
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
  id: 'sparring-match',
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
        'frame.started': {
          guard: 'isValidFrameStart',
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
            target: 'match-over',
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
    'match-over': {
      type: 'final',
    },
  },
})

export type SparringMatchSnapshot = SnapshotFrom<typeof SparringMatchMachine>
export type SparringMatchActor = Actor<typeof SparringMatchMachine>

export function createInitialSnapshot(config: MatchConfig): SparringMatchSnapshot {
  const [snapshot] = initialTransition(SparringMatchMachine, config)
  return snapshot
}

export function getPhase(snapshot: SparringMatchSnapshot): SparringMatchPhase {
  return v.parse(SparringMatchPhaseSchema, snapshot.value)
}

function assertProjectionInvariants(phase: SparringMatchPhase, context: SparringMatchMachineContext): void {
  const { config, completedFrames, framesWonBySeat, nextFrameIndex, activeFrame, winnerSeat } = context

  for (let index = 0; index < completedFrames.length; index += 1) {
    const frame = completedFrames[index]
    if (!frame || frame.frameIndex !== index + 1) {
      throw new Error('Completed frame indices must be contiguous from 1')
    }
    if (frame.breakerSeat !== expectedBreakerSeat(config, frame.frameIndex)) {
      throw new Error('Completed frame breaker must follow match configuration')
    }
  }

  const winsFromOutcomes = completedFrames.reduce<BySeatNumber>(
    (wins, frame) => ({
      A: wins.A + (frame.outcome.winnerSeat === 'A' ? 1 : 0),
      B: wins.B + (frame.outcome.winnerSeat === 'B' ? 1 : 0),
    }),
    { A: 0, B: 0 },
  )
  const parsedWins = v.parse(BySeatNumberSchema, framesWonBySeat)
  if (parsedWins.A !== winsFromOutcomes.A || parsedWins.B !== winsFromOutcomes.B) {
    throw new Error('framesWonBySeat must match completed frame outcomes')
  }

  const expectedNextFrameIndex = completedFrames.length + 1
  if (nextFrameIndex !== expectedNextFrameIndex) {
    throw new Error('nextFrameIndex must equal completed frame count plus one')
  }

  const matchTarget = config.targets.matchTargetFrames

  switch (phase) {
    case 'between-frames': {
      if (activeFrame !== null) {
        throw new Error('between-frames must not have an active frame')
      }
      if (winnerSeat !== null) {
        throw new Error('between-frames must not have a winner')
      }
      if (framesWonBySeat.A >= matchTarget || framesWonBySeat.B >= matchTarget) {
        throw new Error('Match target must not be reached before terminal phase')
      }
      return
    }
    case 'frame-in-progress': {
      if (winnerSeat !== null) {
        throw new Error('frame-in-progress must not have a winner')
      }
      if (!activeFrame) {
        throw new Error('Missing active frame in frame-in-progress phase')
      }
      if (activeFrame.frameIndex !== nextFrameIndex) {
        throw new Error('Active frame index must equal nextFrameIndex')
      }
      if (activeFrame.breakerSeat !== expectedBreakerSeat(config, activeFrame.frameIndex)) {
        throw new Error('Active frame breaker must follow match configuration')
      }
      if (framesWonBySeat.A >= matchTarget || framesWonBySeat.B >= matchTarget) {
        throw new Error('Match target must not be reached before terminal phase')
      }
      return
    }
    case 'match-over': {
      if (activeFrame !== null) {
        throw new Error('match-over must not have an active frame')
      }
      if (!winnerSeat) {
        throw new Error('Missing winner in match-over phase')
      }
      const parsedWinnerSeat = v.parse(SeatSchema, winnerSeat)
      if (framesWonBySeat[parsedWinnerSeat] < matchTarget) {
        throw new Error('Terminal winner must have reached match target')
      }
      const opponent = opponentOf(parsedWinnerSeat)
      if (framesWonBySeat[opponent] >= matchTarget) {
        throw new Error('Only the winner may reach match target in terminal state')
      }
    }
  }
}

export function projectLifecycleState(snapshot: SparringMatchSnapshot): SparringMatchLifecycleState {
  const phase = getPhase(snapshot)
  const context = snapshot.context
  assertProjectionInvariants(phase, context)

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
    case 'match-over':
      return {
        ...base,
        phase,
        winnerSeat: context.winnerSeat!,
      }
  }
}

export function sendLifecycleEvent(snapshot: SparringMatchSnapshot, event: SparringMatchLifecycleEvent): SparringMatchSnapshot {
  const phase = getPhase(snapshot)
  if (!snapshot.can(event)) {
    throw new Error(`Invalid sparring lifecycle event ${event.type} in phase ${phase}`)
  }

  const [nextSnapshot] = transition(SparringMatchMachine, snapshot, event)
  if (nextSnapshot === snapshot) {
    throw new Error(`Invalid sparring lifecycle event ${event.type} in phase ${phase}`)
  }

  projectLifecycleState(nextSnapshot)
  return nextSnapshot
}

export function previewLifecycleEvents(
  snapshot: SparringMatchSnapshot,
  events: readonly SparringMatchLifecycleEvent[],
): SparringMatchSnapshot {
  let current = snapshot
  for (const event of events) {
    current = sendLifecycleEvent(current, event)
  }
  return current
}

export function sparringSnapshotsEqual(left: SparringMatchSnapshot, right: SparringMatchSnapshot): boolean {
  if (left === right) return true
  return (
    left.status === right.status &&
    JSON.stringify(left.value) === JSON.stringify(right.value) &&
    JSON.stringify(left.context) === JSON.stringify(right.context)
  )
}

export function createSparringMatchActor(config: MatchConfig): SparringMatchActor {
  const actor = createActor(SparringMatchMachine, { input: config })
  actor.start()
  return actor
}

export function createSparringMatchActorFromSnapshot(snapshot: SparringMatchSnapshot): SparringMatchActor {
  const actor = createActor(SparringMatchMachine, {
    snapshot,
    input: snapshot.context.config,
  })
  actor.start()
  return actor
}

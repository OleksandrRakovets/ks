import {
  BySeatNumberSchema,
  MatchConfigSchema,
  opponentOf,
  SeatSchema,
  type BySeatNumber,
  type ClientFact,
  type MatchSnapshot,
  type Seat,
} from '@ks/core'
import { NonNegativeIntegerSchema, PositiveIntegerSchema } from '@ks/core'
import * as v from 'valibot'

export type MatchState = {
  config?: v.InferOutput<typeof MatchConfigSchema>
  status: 'empty' | 'active' | 'finished'
  frames: {
    frameIndex: number
    pointsBySeat: BySeatNumber
    breakerSeat: Seat
    winnerSeat?: Seat
  }[]
  framesWonBySeat: BySeatNumber
  currentFrameIndex: number
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const MatchStateFrameSchema = v.object({
  frameIndex: PositiveIntegerSchema,
  pointsBySeat: BySeatNumberSchema,
  breakerSeat: SeatSchema,
  winnerSeat: v.optional(SeatSchema),
})

export const MatchStateSchema = v.object({
  config: v.optional(MatchConfigSchema),
  status: v.picklist(['empty', 'active', 'finished']),
  frames: v.array(MatchStateFrameSchema),
  framesWonBySeat: BySeatNumberSchema,
  currentFrameIndex: NonNegativeIntegerSchema,
})

export function emptyMatchState(): MatchState {
  return {
    status: 'empty',
    frames: [],
    framesWonBySeat: { A: 0, B: 0 },
    currentFrameIndex: 0,
  }
}

function requireConfig(state: MatchState): NonNullable<MatchState['config']> {
  const config = state.config
  assert(config, 'Missing match config')
  return config
}

function getCurrentFrame(state: MatchState): MatchState['frames'][number] {
  const current = state.frames[state.frames.length - 1]
  assert(current && current.frameIndex === state.currentFrameIndex, 'No active frame')
  const frame = current
  assert(!frame.winnerSeat, 'Frame already awarded')
  return frame
}

function gameConfigurationsMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function expectedBreakerSeat(config: NonNullable<MatchState['config']>, frameIndex: number): Seat {
  return frameIndex % 2 === 1 ? config.firstBreakerSeat : opponentOf(config.firstBreakerSeat)
}

export function applyMatchFact(prev: MatchState, fact: ClientFact): MatchState {
  const state = prev.status === 'empty' ? emptyMatchState() : prev

  switch (fact.type) {
    case 'match.created': {
      return {
        config: fact.payload,
        status: 'active',
        frames: [],
        framesWonBySeat: { A: 0, B: 0 },
        currentFrameIndex: 0,
      }
    }
    case 'frame.started': {
      assert(state.status === 'active', 'Cannot start frame when not active')
      const config = requireConfig(state)
      assert(fact.payload.gameKey === config.gameKey, 'Started frame game key does not match match config')
      assert(
        fact.payload.targetPointsBySeat.A === config.targets.frameTargetPointsBySeat.A &&
          fact.payload.targetPointsBySeat.B === config.targets.frameTargetPointsBySeat.B,
        'Started frame target does not match match config',
      )
      assert(
        gameConfigurationsMatch(fact.payload.gameConfiguration, config.gameConfiguration),
        'Started frame game configuration does not match match config',
      )

      const matchTargetFrames = config.targets.matchTargetFrames
      const isMatchTargetReached = state.framesWonBySeat.A >= matchTargetFrames || state.framesWonBySeat.B >= matchTargetFrames
      assert(!isMatchTargetReached, 'Cannot start new frame after match target is reached')

      const { frameIndex } = fact.payload
      const last = state.frames[state.frames.length - 1]
      assert(!last || last.winnerSeat, 'Cannot start a new frame while current is unawarded')
      assert(frameIndex === state.currentFrameIndex + 1, 'Frame index must be sequential')
      assert(fact.payload.breakerSeat === expectedBreakerSeat(config, frameIndex), 'Frame breaker seat must follow match order')

      state.currentFrameIndex = frameIndex
      state.frames.push({
        frameIndex,
        pointsBySeat: { A: 0, B: 0 },
        breakerSeat: fact.payload.breakerSeat,
      })
      return state
    }
    case 'game.command': {
      assert(state.status === 'active', 'Cannot apply game command when not active')
      const config = requireConfig(state)
      assert(fact.payload.gameKey === config.gameKey, 'Game command key does not match match config')
      const frame = getCurrentFrame(state)
      assert(fact.payload.frameIndex === frame.frameIndex, 'Game command frame index does not match current frame')
      return state
    }
    case 'frame.completed': {
      assert(state.status === 'active', 'Cannot complete frame when not active')
      const config = requireConfig(state)
      assert(fact.payload.gameKey === config.gameKey, 'Completed frame game key does not match match config')
      const frame = getCurrentFrame(state)
      assert(fact.payload.frameIndex === frame.frameIndex, 'Completed frame index does not match current frame')

      frame.pointsBySeat = fact.payload.outcome.score
      frame.winnerSeat = fact.payload.outcome.winnerSeat
      state.framesWonBySeat[fact.payload.outcome.winnerSeat] += 1
      return state
    }
    case 'frame.reopened': {
      throw new Error('TODO: frame.reopened is reserved for undo controller')
    }
    case 'match.ended': {
      assert(state.status === 'active', 'Cannot end match when not active')
      const config = requireConfig(state)
      assert(
        state.framesWonBySeat[fact.payload.winnerSeat] >= config.targets.matchTargetFrames,
        'Cannot end match before target',
      )
      state.status = 'finished'
      return state
    }
  }
}

export function snapshotFromMatchState(state: MatchState, latestSeq: number): MatchSnapshot {
  const config = requireConfig(state)
  return {
    matchId: config.matchId,
    gameKey: config.gameKey,
    targets: config.targets,
    status: state.status === 'finished' ? 'finished' : 'active',
    currentFrameIndex: state.currentFrameIndex,
    framesWonBySeat: state.framesWonBySeat,
    frames: state.frames,
    latestSeq,
  }
}

export function deriveMatchState(facts: ClientFact[], baseState: MatchState = emptyMatchState()): MatchState {
  let state = baseState
  for (const fact of facts) {
    state = applyMatchFact(state, fact)
  }
  return state
}

export function deriveMatchSnapshot(
  facts: ClientFact[],
  latestSeq: number,
  baseState: MatchState = emptyMatchState(),
): MatchSnapshot {
  const state = deriveMatchState(facts, baseState)
  return snapshotFromMatchState(state, latestSeq)
}

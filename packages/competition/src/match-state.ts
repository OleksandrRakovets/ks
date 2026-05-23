import {
  BySeatNumberSchema,
  MatchConfigSchema,
  SeatSchema,
  type BySeatNumber,
  type ClientEvent,
  type MatchSnapshot,
  type Seat,
} from '@ks/core'
import { z } from 'zod'

export type MatchState = {
  config?: z.infer<typeof MatchConfigSchema>
  status: 'empty' | 'active' | 'finished'
  frames: {
    frameIndex: number
    pointsBySeat: BySeatNumber
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

const MatchStateFrameSchema = z.object({
  frameIndex: z.number().int().positive(),
  pointsBySeat: BySeatNumberSchema,
  winnerSeat: SeatSchema.optional(),
})

export const MatchStateSchema = z.object({
  config: MatchConfigSchema.optional(),
  status: z.enum(['empty', 'active', 'finished']),
  frames: z.array(MatchStateFrameSchema),
  framesWonBySeat: BySeatNumberSchema,
  currentFrameIndex: z.number().int().nonnegative(),
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

export function applyMatchEvent(prev: MatchState, event: ClientEvent): MatchState {
  const state = prev.status === 'empty' ? emptyMatchState() : prev

  switch (event.type) {
    case 'match.created': {
      return {
        config: event.payload,
        status: 'active',
        frames: [],
        framesWonBySeat: { A: 0, B: 0 },
        currentFrameIndex: 0,
      }
    }
    case 'frame.started': {
      assert(state.status === 'active', 'Cannot start frame when not active')
      const config = requireConfig(state)
      assert(event.payload.gameKey === config.gameKey, 'Started frame game key does not match match config')
      assert(
        event.payload.targetPointsBySeat.A === config.targets.frameTargetPointsBySeat.A &&
          event.payload.targetPointsBySeat.B === config.targets.frameTargetPointsBySeat.B,
        'Started frame target does not match match config',
      )

      const matchTargetFrames = config.targets.matchTargetFrames
      const isMatchTargetReached = state.framesWonBySeat.A >= matchTargetFrames || state.framesWonBySeat.B >= matchTargetFrames
      assert(!isMatchTargetReached, 'Cannot start new frame after match target is reached')

      const { frameIndex } = event.payload
      const last = state.frames[state.frames.length - 1]
      assert(!last || last.winnerSeat, 'Cannot start a new frame while current is unawarded')
      assert(frameIndex === state.currentFrameIndex + 1, 'Frame index must be sequential')

      state.currentFrameIndex = frameIndex
      state.frames.push({
        frameIndex,
        pointsBySeat: { A: 0, B: 0 },
      })
      return state
    }
    case 'game.command': {
      assert(state.status === 'active', 'Cannot apply game command when not active')
      const config = requireConfig(state)
      assert(event.payload.gameKey === config.gameKey, 'Game command key does not match match config')
      const frame = getCurrentFrame(state)
      assert(event.payload.frameIndex === frame.frameIndex, 'Game command frame index does not match current frame')
      return state
    }
    case 'frame.completed': {
      assert(state.status === 'active', 'Cannot complete frame when not active')
      const config = requireConfig(state)
      assert(event.payload.gameKey === config.gameKey, 'Completed frame game key does not match match config')
      const frame = getCurrentFrame(state)
      assert(event.payload.frameIndex === frame.frameIndex, 'Completed frame index does not match current frame')

      frame.pointsBySeat = event.payload.outcome.score
      frame.winnerSeat = event.payload.outcome.winnerSeat
      state.framesWonBySeat[event.payload.outcome.winnerSeat] += 1
      return state
    }
    case 'frame.reopened': {
      throw new Error('TODO: frame.reopened is reserved for undo controller')
    }
    case 'match.ended': {
      assert(state.status === 'active', 'Cannot end match when not active')
      const config = requireConfig(state)
      assert(
        state.framesWonBySeat[event.payload.winnerSeat] >= config.targets.matchTargetFrames,
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

export function deriveMatchState(events: ClientEvent[], baseState: MatchState = emptyMatchState()): MatchState {
  let state = baseState
  for (const event of events) {
    state = applyMatchEvent(state, event)
  }
  return state
}

export function deriveMatchSnapshot(
  events: ClientEvent[],
  latestSeq: number,
  baseState: MatchState = emptyMatchState(),
): MatchSnapshot {
  const state = deriveMatchState(events, baseState)
  return snapshotFromMatchState(state, latestSeq)
}

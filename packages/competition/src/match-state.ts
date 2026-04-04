import { BySeatNumberSchema, MatchConfigSchema, SeatSchema, type ClientEvent, type MatchSnapshot, type Seat } from '@ks/core'
import { applyGameCommand, createInitialGameState, deriveGameProjection, parseGameKey } from '@ks/gameplay'
import { z } from 'zod'

export type MatchState = {
  config?: z.infer<typeof MatchConfigSchema>
  status: 'empty' | 'active' | 'finished'
  frames: {
    frameIndex: number
    // Canonical per-frame game state owned by the selected gameplay runtime.
    gameState: unknown
    // Denormalized per-frame score for cheap match list / summary reads without
    // needing to rehydrate gameState and invoke gameplay projections.
    pointsBySeat: { A: number; B: number }
    winnerSeat?: Seat
  }[]
  framesWonBySeat: { A: number; B: number }
  currentFrameIndex: number
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const MatchStateFrameSchema = z.object({
  frameIndex: z.number().int().positive(),
  gameState: z.unknown(),
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

const ProjectionScoreSchema = z.object({
  score: z.object({ A: z.number().int(), B: z.number().int() }),
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

function syncFrameScoreFromGameState(state: MatchState, frame: MatchState['frames'][number]): void {
  const config = requireConfig(state)

  const scoreboard = ProjectionScoreSchema.parse(
    deriveGameProjection({
      gameKey: parseGameKey(config.gameKey),
      state: frame.gameState,
      projection: 'scoreboard',
    }),
  )

  frame.pointsBySeat = scoreboard.score
}

function applyLegacyScoreDelta(state: MatchState, seat: Seat, delta: number): void {
  const config = requireConfig(state)
  const gameKey = parseGameKey(config.gameKey)

  const frame = getCurrentFrame(state)
  const result = applyGameCommand({
    gameKey,
    state: frame.gameState,
    commandType: 'shot.recorded',
    command: { seat, points: delta },
  })

  frame.gameState = result.state
  syncFrameScoreFromGameState(state, frame)
}

function applyLegacyScoreSet(state: MatchState, seat: Seat, value: number): void {
  const frame = getCurrentFrame(state)
  const delta = value - frame.pointsBySeat[seat]
  applyLegacyScoreDelta(state, seat, delta)
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

      const matchTargetFrames = config.targets.matchTargetFrames
      const isMatchTargetReached = state.framesWonBySeat.A >= matchTargetFrames || state.framesWonBySeat.B >= matchTargetFrames
      assert(!isMatchTargetReached, 'Cannot start new frame after match target is reached')

      const { frameIndex } = event.payload
      const last = state.frames[state.frames.length - 1]
      assert(!last || last.winnerSeat, 'Cannot start a new frame while current is unawarded')
      assert(frameIndex === state.currentFrameIndex + 1, 'Frame index must be sequential')
      const gameKey = parseGameKey(config.gameKey)

      state.currentFrameIndex = frameIndex
      state.frames.push({
        frameIndex,
        gameState: createInitialGameState(gameKey),
        pointsBySeat: { A: 0, B: 0 },
      })
      return state
    }
    case 'score.delta': {
      assert(state.status === 'active', 'Cannot score when not active')
      applyLegacyScoreDelta(state, event.payload.seat, event.payload.delta)
      return state
    }
    case 'score.set': {
      assert(state.status === 'active', 'Cannot score when not active')
      applyLegacyScoreSet(state, event.payload.seat, event.payload.value)
      return state
    }
    case 'game.command': {
      assert(state.status === 'active', 'Cannot apply game command when not active')
      const config = requireConfig(state)
      assert(event.payload.gameKey === config.gameKey, 'Game command key does not match match config')
      const gameKey = parseGameKey(event.payload.gameKey)

      const frame = getCurrentFrame(state)
      const result = applyGameCommand({
        gameKey,
        state: frame.gameState,
        commandType: event.payload.commandType,
        command: event.payload.command,
      })

      frame.gameState = result.state
      syncFrameScoreFromGameState(state, frame)
      return state
    }
    case 'frame.awarded': {
      assert(state.status === 'active', 'Cannot award frame when not active')
      const frame = state.frames.find((f) => f.frameIndex === event.payload.frameIndex)
      assert(frame, 'Unknown frame')
      const currentFrame = frame
      assert(!currentFrame.winnerSeat, 'Frame already awarded')
      currentFrame.winnerSeat = event.payload.winnerSeat
      state.framesWonBySeat[event.payload.winnerSeat] += 1
      return state
    }
    case 'frame.reopened': {
      assert(state.status === 'active', 'Cannot reopen frame when not active')
      const frameIndex = state.frames.findIndex((f) => f.frameIndex === event.payload.frameIndex)
      assert(frameIndex >= 0, 'Unknown frame')

      const frame = state.frames[frameIndex]
      assert(frame, 'Unknown frame')
      const reopenedFrame = frame
      if (!reopenedFrame.winnerSeat) return state
      state.framesWonBySeat[reopenedFrame.winnerSeat] = Math.max(0, state.framesWonBySeat[reopenedFrame.winnerSeat] - 1)

      const { winnerSeat: _winnerSeat, ...frameWithoutWinner } = reopenedFrame
      state.frames[frameIndex] = frameWithoutWinner
      return state
    }
    case 'match.ended': {
      if (state.status !== 'active') return state
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
    participants: config.participants,
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

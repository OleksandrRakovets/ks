import {
  BySeatNumberSchema,
  MatchConfigSchema,
  SeatSchema,
  type GameKey,
  type MatchConfig,
  type MatchSnapshot,
  type Seat,
} from '@ks/core'
import invariant from 'tiny-invariant'
import { z } from 'zod'

export type MatchState = {
  config?: MatchConfig
  status: 'empty' | 'active' | 'finished'
  frames: {
    frameIndex: number
    pointsBySeat: { A: number; B: number }
    winnerSeat?: Seat
  }[]
  framesWonBySeat: { A: number; B: number }
  currentFrameIndex: number
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

export function emptyState(): MatchState {
  return {
    status: 'empty',
    frames: [],
    framesWonBySeat: { A: 0, B: 0 },
    currentFrameIndex: 0,
  }
}

export function toSnapshot(state: MatchState, latestSeq: number): MatchSnapshot {
  invariant(state.config, 'Cannot snapshot without config')
  return {
    matchId: state.config.matchId,
    gameKey: state.config.gameKey,
    targets: state.config.targets,
    participants: state.config.participants,
    status: state.status === 'finished' ? 'finished' : 'active',
    currentFrameIndex: state.currentFrameIndex,
    framesWonBySeat: state.framesWonBySeat,
    frames: state.frames,
    latestSeq,
  }
}

export function getGameKey(state: MatchState): GameKey {
  invariant(state.config, 'Missing match config')
  return state.config.gameKey
}

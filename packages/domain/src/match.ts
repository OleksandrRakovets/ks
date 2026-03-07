import { z } from 'zod/v4'

import { MatchIdSchema, PlayerIdSchema } from './ids'

export const SeatSchema = z.enum(['A', 'B'])
export type Seat = z.infer<typeof SeatSchema>

export const GameIdSchema = z.enum(['free-pyramid', 'combined-pyramid-old'])
export type GameId = z.infer<typeof GameIdSchema>

export const BySeatNumberSchema = z.object({ A: z.number().int(), B: z.number().int() })

export const MatchTargetsSchema = z.object({
  frameTargetPointsBySeat: BySeatNumberSchema,
  matchTargetFramesBySeat: BySeatNumberSchema,
})

export const MatchParticipantSchema = z.object({
  seat: SeatSchema,
  savedPlayerId: PlayerIdSchema.optional(),
  displayName: z.string().min(1).max(64),
})

export const MatchConfigSchema = z.object({
  matchId: MatchIdSchema,
  gameId: GameIdSchema,
  targets: MatchTargetsSchema,
  participants: z.array(MatchParticipantSchema).length(2),
})

export type MatchConfig = z.infer<typeof MatchConfigSchema>

export type FrameState = {
  frameIndex: number
  pointsBySeat: { A: number; B: number }
  winnerSeat?: Seat
}

export type MatchSnapshot = {
  matchId: string
  gameId: GameId
  targets: MatchConfig['targets']
  participants: MatchConfig['participants']
  status: 'active' | 'finished'
  currentFrameIndex: number
  framesWonBySeat: { A: number; B: number }
  frames: FrameState[]
  latestSeq: number
}

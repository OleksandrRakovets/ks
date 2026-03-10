import { z } from 'zod'
import invariant from 'tiny-invariant'

import { MatchIdSchema, PlayerIdSchema } from './ids'

export const SeatSchema = z.enum(['A', 'B'])
export type Seat = z.infer<typeof SeatSchema>

export const GameKeySchema = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/)
export type GameKey = z.infer<typeof GameKeySchema>

// Backward-compatible aliases while old references are being migrated.
export const GameIdSchema = GameKeySchema
export type GameId = GameKey

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

const MatchConfigWireSchema = z
  .object({
    matchId: MatchIdSchema,
    gameKey: GameKeySchema.optional(),
    gameId: GameKeySchema.optional(),
    targets: MatchTargetsSchema,
    participants: z.array(MatchParticipantSchema).length(2),
  })
  .superRefine((value, ctx) => {
    if (!value.gameKey && !value.gameId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'gameKey is required',
      })
    }
  })

export const MatchConfigSchema = MatchConfigWireSchema.transform(({ gameKey, gameId, ...rest }) => {
  const resolvedGameKey = gameKey ?? gameId
  invariant(resolvedGameKey, 'gameKey is required')

  return {
    ...rest,
    gameKey: resolvedGameKey,
  }
})

export type MatchConfig = z.infer<typeof MatchConfigSchema>

export type FrameState = {
  frameIndex: number
  pointsBySeat: { A: number; B: number }
  winnerSeat?: Seat
}

export type MatchSnapshot = {
  matchId: string
  gameKey: GameKey
  targets: MatchConfig['targets']
  participants: MatchConfig['participants']
  status: 'active' | 'finished'
  currentFrameIndex: number
  framesWonBySeat: { A: number; B: number }
  frames: FrameState[]
  latestSeq: number
}

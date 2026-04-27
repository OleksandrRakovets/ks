import invariant from 'tiny-invariant'
import { z } from 'zod'

import { MatchIdSchema, PlayerRefSchema } from './ids'

export const SeatSchema = z.enum(['A', 'B'])
export type Seat = z.infer<typeof SeatSchema>

export function opponentOf(seat: Seat): Seat {
  return seat === 'A' ? 'B' : 'A'
}

export const GameKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/)
export type GameKey = z.infer<typeof GameKeySchema>

// Backward-compatible aliases while old references are being migrated.
export const GameIdSchema = GameKeySchema
export type GameId = GameKey

export const BySeatNumberSchema = z.object({ A: z.number().int(), B: z.number().int() })

export const MatchTargetsSchema = z.object({
  frameTargetPointsBySeat: BySeatNumberSchema,
  matchTargetFrames: z.number().int().positive(),
})

export const MatchSeatAssignmentSchema = z.object({
  seat: SeatSchema,
  playerRef: PlayerRefSchema,
})

export const HydratedMatchParticipantSchema = z.object({
  playerRef: PlayerRefSchema,
  displayName: z.string().min(1).max(128),
  shortDisplayName: z.string().min(1).max(128),
})

export const HydratedMatchParticipantsSchema = z.object({
  A: HydratedMatchParticipantSchema,
  B: HydratedMatchParticipantSchema,
})

const MatchConfigWireSchema = z
  .object({
    matchId: MatchIdSchema,
    gameKey: GameKeySchema.optional(),
    gameId: GameKeySchema.optional(),
    targets: MatchTargetsSchema,
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

export const FrameStateSchema = z.object({
  frameIndex: z.number().int().positive(),
  pointsBySeat: BySeatNumberSchema,
  winnerSeat: SeatSchema.optional(),
})
export type FrameState = z.infer<typeof FrameStateSchema>

export const MatchSnapshotSchema = z.object({
  matchId: MatchIdSchema,
  gameKey: GameKeySchema,
  targets: MatchTargetsSchema,
  status: z.enum(['active', 'finished']),
  currentFrameIndex: z.number().int().nonnegative(),
  framesWonBySeat: BySeatNumberSchema,
  frames: z.array(FrameStateSchema),
  latestSeq: z.number().int().nonnegative(),
})
export type MatchSnapshot = z.infer<typeof MatchSnapshotSchema>

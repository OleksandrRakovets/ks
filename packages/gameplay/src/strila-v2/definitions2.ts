import { BySeatNumberSchema } from '@ks/core'
import { z } from 'zod'

export const STRILA_COLORED_BALLS = [1, 2, 3, 4, 5, 6, 7] as const

export const StrilaSeatSchema = z.enum(['A', 'B'])
export type StrilaSeat = z.infer<typeof StrilaSeatSchema>

export const StrilaColoredBallSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
])
export type StrilaColoredBall = z.infer<typeof StrilaColoredBallSchema>

export const StrilaBallSchema = z.union([z.literal(0), StrilaColoredBallSchema])
export type StrilaBall = z.infer<typeof StrilaBallSchema>

export const StrilaFoulResponseChoiceSchema = z.enum(['play-from-position', 'pass-position', 'ball-in-hand'])

export const StrilaEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('frame.commence'), actor: StrilaSeatSchema }),
  z.object({ type: z.literal('pot.record'), actor: StrilaSeatSchema, pottedBalls: z.array(StrilaBallSchema) }),
  z.object({ type: z.literal('miss.record'), actor: StrilaSeatSchema }),
  z.object({ type: z.literal('foul.commit'), actor: StrilaSeatSchema }),
  z.object({ type: z.literal('penalty.select'), actor: StrilaSeatSchema, choice: StrilaFoulResponseChoiceSchema }),
  z.object({ type: z.literal('frame.award'), actor: StrilaSeatSchema }),
  z.object({ type: z.literal('frame.concede'), actor: StrilaSeatSchema }),
])

export const StrilaPhases = [
  'not-started',
  'open-play',
  'foul-committed.penalty-selection',
  'foul-committed.ball-in-hand',
  'respotted-black.opening',
  'respotted-black.play',
  'winner-determined',
  'frame-over',
] as const

export type StrilaPhase = (typeof StrilaPhases)[number]

export const StrilaWinReasons = ['target-reached', 'respotted-black-won', 'conceded', 'automatic-foul'] as const
export type StrilaWinReason = (typeof StrilaWinReasons)[number]

export type StrilaEvent = z.infer<typeof StrilaEventSchema>

export const StrilaContextSchema = z.object({
  score: z.object({ A: z.number().int().nonnegative(), B: z.number().int().nonnegative() }),
  targetPointsBySeat: BySeatNumberSchema,
  coloredBallsOnTable: z.array(StrilaColoredBallSchema),
  cueBallPotsInRun: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  chooser: StrilaSeatSchema.nullable(),
  offender: StrilaSeatSchema.nullable(),
  winner: StrilaSeatSchema.nullable(),
  winReason: z.enum(['target-reached', 'respotted-black-won', 'conceded', 'automatic-foul']).nullable(),
})

export type StrilaContext = z.infer<typeof StrilaContextSchema>

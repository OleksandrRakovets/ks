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

export type StrilaContext = {
  score: { A: number; B: number }
  targetPointsBySeat: { A: number; B: number }
  coloredBallsOnTable: StrilaColoredBall[]
  actor: StrilaSeat | null
  cueBallPotsInRun: 0 | 1 | 2
  chooser: StrilaSeat | null
  offender: StrilaSeat | null
  winner: StrilaSeat | null
  winReason: StrilaWinReason | null
}

export const StrilaPhases = [
  'not-started',
  'open-play',
  'penalty-selection',
  'ball-in-hand',
  'respotted-black-opening',
  'respotted-black-play',
  'winner-determined',
  'frame-over',
] as const

export type StrilaPhase = (typeof StrilaPhases)[number]

export const StrilaWinReasons = ['target-reached', 'respotted-black-won', 'conceded', 'automatic-foul'] as const
export type StrilaWinReason = (typeof StrilaWinReasons)[number]

export const StrilaFoulResponseChoiceSchema = z.enum(['play-from-position', 'pass-position', 'ball-in-hand'])

export type StrilaEvent =
  | { type: 'frame.commence'; actor: StrilaSeat }
  | { type: 'pot.record'; actor: StrilaSeat; pottedBalls: StrilaBall[] }
  | { type: 'miss.record'; actor: StrilaSeat }
  | { type: 'foul.commit'; actor: StrilaSeat }
  | { type: 'penalty.select'; actor: StrilaSeat; choice: z.infer<typeof StrilaFoulResponseChoiceSchema> }
  | { type: 'frame.award'; actor: StrilaSeat }
  | { type: 'frame.concede'; actor: StrilaSeat }

export const StrilaContextSchema = z.object({
  score: z.object({ A: z.number().int().nonnegative(), B: z.number().int().nonnegative() }),
  targetPointsBySeat: BySeatNumberSchema,
  coloredBallsOnTable: z.array(StrilaColoredBallSchema),
  actor: StrilaSeatSchema.nullable(),
  cueBallPotsInRun: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  chooser: StrilaSeatSchema.nullable(),
  offender: StrilaSeatSchema.nullable(),
  winner: StrilaSeatSchema.nullable(),
  winReason: z.enum(['target-reached', 'respotted-black-won', 'conceded', 'automatic-foul']).nullable(),
})

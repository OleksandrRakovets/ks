import { z } from 'zod/v4'

import { ClientIdSchema, EventIdSchema, MatchIdSchema } from './ids'
import { GameKeySchema, MatchConfigSchema, SeatSchema } from './match'

const BaseClientEventSchema = z.object({
  eventId: EventIdSchema,
  matchId: MatchIdSchema,
  clientId: ClientIdSchema,
  clientSeq: z.number().int().nonnegative(),
  at: z.number().int().nonnegative(),
})

export const MatchCreatedEventSchema = BaseClientEventSchema.extend({
  type: z.literal('match.created'),
  payload: MatchConfigSchema,
})

export const FrameStartedEventSchema = BaseClientEventSchema.extend({
  type: z.literal('frame.started'),
  payload: z.object({ frameIndex: z.number().int().positive() }),
})

export const GameCommandEventSchema = BaseClientEventSchema.extend({
  type: z.literal('game.command'),
  payload: z.object({
    gameKey: GameKeySchema,
    commandType: z.string().min(1).max(64),
    command: z.unknown(),
  }),
})

export const ScoreDeltaEventSchema = BaseClientEventSchema.extend({
  type: z.literal('score.delta'),
  payload: z.object({ seat: SeatSchema, delta: z.number().int() }),
})

export const ScoreSetEventSchema = BaseClientEventSchema.extend({
  type: z.literal('score.set'),
  payload: z.object({ seat: SeatSchema, value: z.number().int() }),
})

export const FrameAwardedEventSchema = BaseClientEventSchema.extend({
  type: z.literal('frame.awarded'),
  payload: z.object({
    frameIndex: z.number().int().positive(),
    winnerSeat: SeatSchema,
    reason: z.string().min(1).max(64).optional(),
  }),
})

export const FrameReopenedEventSchema = BaseClientEventSchema.extend({
  type: z.literal('frame.reopened'),
  payload: z.object({
    frameIndex: z.number().int().positive(),
    reason: z.string().min(1).max(64).optional(),
  }),
})

export const MatchEndedEventSchema = BaseClientEventSchema.extend({
  type: z.literal('match.ended'),
  payload: z.object({ reason: z.string().min(1).max(64).optional() }).optional(),
})

export const ClientEventSchema = z.discriminatedUnion('type', [
  MatchCreatedEventSchema,
  FrameStartedEventSchema,
  GameCommandEventSchema,
  ScoreDeltaEventSchema,
  ScoreSetEventSchema,
  FrameAwardedEventSchema,
  FrameReopenedEventSchema,
  MatchEndedEventSchema,
])

export type ClientEvent = z.infer<typeof ClientEventSchema>

export type StoredEvent = ClientEvent & {
  seq: number
  receivedAt: number
}

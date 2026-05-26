import { z } from 'zod'

import { ClientIdSchema, EventIdSchema, MatchIdSchema } from './ids'
import { BySeatNumberSchema, FrameOutcomeSchema, GameKeySchema, MatchConfigSchema, SeatSchema } from './match'

export const ProtocolEntrySourceSchema = z.enum(['player', 'system'])
export type ProtocolEntrySource = z.infer<typeof ProtocolEntrySourceSchema>

export const ProtocolEntryTypeSchema = z.enum(['player-command', 'system-note', 'correction'])
export type ProtocolEntryType = z.infer<typeof ProtocolEntryTypeSchema>

export const ProtocolEntrySchema = z.object({
  source: ProtocolEntrySourceSchema,
  entryType: ProtocolEntryTypeSchema,
  seat: SeatSchema.optional(),
  scoreAfter: BySeatNumberSchema.optional(),
  body: z.record(z.string(), z.unknown()),
})
export type ProtocolEntry = z.infer<typeof ProtocolEntrySchema>

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
  payload: z.object({
    frameIndex: z.number().int().positive(),
    gameKey: GameKeySchema,
    targetPointsBySeat: BySeatNumberSchema,
  }),
})

export const GameCommandEventSchema = BaseClientEventSchema.extend({
  type: z.literal('game.command'),
  payload: z.object({
    frameIndex: z.number().int().positive(),
    gameKey: GameKeySchema,
    commandType: z.string().min(1).max(64),
    command: z.record(z.string(), z.unknown()),
    protocolEntries: z.array(ProtocolEntrySchema).min(1),
  }),
})

export const FrameCompletedEventSchema = BaseClientEventSchema.extend({
  type: z.literal('frame.completed'),
  payload: z.object({
    frameIndex: z.number().int().positive(),
    gameKey: GameKeySchema,
    outcome: FrameOutcomeSchema,
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
  payload: z.object({ winnerSeat: SeatSchema }),
})

export const ClientEventSchema = z.discriminatedUnion('type', [
  MatchCreatedEventSchema,
  FrameStartedEventSchema,
  GameCommandEventSchema,
  FrameCompletedEventSchema,
  FrameReopenedEventSchema,
  MatchEndedEventSchema,
])

export type ClientEvent = z.infer<typeof ClientEventSchema>

export const StoredEventSchema = ClientEventSchema.and(
  z.object({
    seq: z.number().int().positive(),
    receivedAt: z.number().int().nonnegative(),
  }),
)

export type StoredEvent = z.infer<typeof StoredEventSchema>

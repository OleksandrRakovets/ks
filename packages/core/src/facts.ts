import * as v from 'valibot'

import { ClientIdSchema, FactIdSchema, MatchIdSchema } from './ids'
import { BySeatNumberSchema, FrameOutcomeSchema, GameKeySchema, MatchConfigSchema, SeatSchema } from './match'
import { NonNegativeIntegerSchema, PositiveIntegerSchema, SizedStringSchema, UnknownObjectSchema } from './valicombos'

export const ProtocolEntrySourceSchema = v.picklist(['player', 'system'])
export type ProtocolEntrySource = v.InferOutput<typeof ProtocolEntrySourceSchema>

export const ProtocolEntryTypeSchema = v.picklist(['player-command', 'system-note', 'correction'])
export type ProtocolEntryType = v.InferOutput<typeof ProtocolEntryTypeSchema>

export const ProtocolEntrySchema = v.object({
  source: ProtocolEntrySourceSchema,
  entryType: ProtocolEntryTypeSchema,
  seat: v.optional(SeatSchema),
  scoreAfter: v.optional(BySeatNumberSchema),
  body: UnknownObjectSchema,
})
export type ProtocolEntry = v.InferOutput<typeof ProtocolEntrySchema>

const BaseClientFactSchema = v.object({
  factId: FactIdSchema,
  matchId: MatchIdSchema,
  clientId: ClientIdSchema,
  clientSeq: NonNegativeIntegerSchema,
  at: PositiveIntegerSchema,
})

export const MatchCreatedFactSchema = v.object({
  ...BaseClientFactSchema.entries,
  type: v.literal('match.created'),
  payload: MatchConfigSchema,
})

export const FrameStartedFactSchema = v.object({
  ...BaseClientFactSchema.entries,
  type: v.literal('frame.started'),
  payload: v.object({
    frameIndex: PositiveIntegerSchema,
    gameKey: GameKeySchema,
    targetPointsBySeat: BySeatNumberSchema,
  }),
})

export const GameCommandFactSchema = v.object({
  ...BaseClientFactSchema.entries,
  type: v.literal('game.command'),
  payload: v.object({
    frameIndex: PositiveIntegerSchema,
    gameKey: GameKeySchema,
    commandType: SizedStringSchema(1, 64),
    command: UnknownObjectSchema,
    protocolEntries: v.pipe(v.array(ProtocolEntrySchema), v.minLength(1)),
  }),
})

export const FrameCompletedFactSchema = v.object({
  ...BaseClientFactSchema.entries,
  type: v.literal('frame.completed'),
  payload: v.object({
    frameIndex: PositiveIntegerSchema,
    gameKey: GameKeySchema,
    outcome: FrameOutcomeSchema,
  }),
})

export const FrameReopenedFactSchema = v.object({
  ...BaseClientFactSchema.entries,
  type: v.literal('frame.reopened'),
  payload: v.object({
    frameIndex: PositiveIntegerSchema,
    reason: v.optional(SizedStringSchema(1, 64)),
  }),
})

export const MatchEndedFactSchema = v.object({
  ...BaseClientFactSchema.entries,
  type: v.literal('match.ended'),
  payload: v.object({ winnerSeat: SeatSchema }),
})

export const ClientFactSchema = v.variant('type', [
  MatchCreatedFactSchema,
  FrameStartedFactSchema,
  GameCommandFactSchema,
  FrameCompletedFactSchema,
  FrameReopenedFactSchema,
  MatchEndedFactSchema,
])

export type ClientFact = v.InferOutput<typeof ClientFactSchema>

export const StoredFactSchema = v.intersect([
  ClientFactSchema,
  v.object({
    seq: PositiveIntegerSchema,
    receivedAt: PositiveIntegerSchema,
  }),
])

export type StoredFact = v.InferOutput<typeof StoredFactSchema>

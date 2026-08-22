import * as v from 'valibot'

import { CommandIdSchema, FactIdSchema, MatchIdSchema } from './ids'
import {
  BySeatNumberSchema,
  FrameOutcomeSchema,
  GameConfigurationSchema,
  GameKeySchema,
  MatchConfigSchema,
  SeatSchema,
} from './match'
import { UnixEpochMillisecondsSchema } from './time'
import { PositiveIntegerSchema, SizedStringSchema, UnknownObjectSchema } from './valicombos'

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

export const FrameStartedPayloadSchema = v.object({
  frameIndex: PositiveIntegerSchema,
  gameKey: GameKeySchema,
  targetPointsBySeat: BySeatNumberSchema,
  breakerSeat: SeatSchema,
  gameConfiguration: v.optional(GameConfigurationSchema),
})
export type FrameStartedPayload = v.InferOutput<typeof FrameStartedPayloadSchema>

export const GameCommandPayloadSchema = v.object({
  frameIndex: PositiveIntegerSchema,
  gameKey: GameKeySchema,
  commandType: SizedStringSchema(1, 64),
  command: UnknownObjectSchema,
  protocolEntries: v.pipe(v.array(ProtocolEntrySchema), v.minLength(1)),
})
export type GameCommandPayload = v.InferOutput<typeof GameCommandPayloadSchema>

export const FrameCompletedPayloadSchema = v.object({
  frameIndex: PositiveIntegerSchema,
  gameKey: GameKeySchema,
  outcome: FrameOutcomeSchema,
})
export type FrameCompletedPayload = v.InferOutput<typeof FrameCompletedPayloadSchema>

export const MatchEndedPayloadSchema = v.object({
  winnerSeat: SeatSchema,
})
export type MatchEndedPayload = v.InferOutput<typeof MatchEndedPayloadSchema>

export const MatchCreatedFactDraftSchema = v.object({
  type: v.literal('match.created'),
  payload: MatchConfigSchema,
})

export const FrameStartedFactDraftSchema = v.object({
  type: v.literal('frame.started'),
  payload: FrameStartedPayloadSchema,
})

export const GameCommandFactDraftSchema = v.object({
  type: v.literal('game.command'),
  payload: GameCommandPayloadSchema,
})

export const FrameCompletedFactDraftSchema = v.object({
  type: v.literal('frame.completed'),
  payload: FrameCompletedPayloadSchema,
})

export const MatchEndedFactDraftSchema = v.object({
  type: v.literal('match.ended'),
  payload: MatchEndedPayloadSchema,
})

export const MatchFactDraftSchema = v.variant('type', [
  MatchCreatedFactDraftSchema,
  FrameStartedFactDraftSchema,
  GameCommandFactDraftSchema,
  FrameCompletedFactDraftSchema,
  MatchEndedFactDraftSchema,
])

export type MatchFactDraft = v.InferOutput<typeof MatchFactDraftSchema>

const MatchFactEnvelopeBaseSchema = v.object({
  factId: FactIdSchema,
  matchId: MatchIdSchema,
  occurredAt: UnixEpochMillisecondsSchema,
})

export const MatchCreatedFactSchema = v.pipe(
  v.object({
    ...MatchFactEnvelopeBaseSchema.entries,
    causedByCommandId: v.null(),
    type: v.literal('match.created'),
    payload: MatchConfigSchema,
  }),
  v.check((input) => input.matchId === input.payload.matchId, 'match.created envelope and payload match IDs must agree'),
)

export const FrameStartedFactSchema = v.object({
  ...MatchFactEnvelopeBaseSchema.entries,
  causedByCommandId: CommandIdSchema,
  type: v.literal('frame.started'),
  payload: FrameStartedPayloadSchema,
})

export const GameCommandFactSchema = v.object({
  ...MatchFactEnvelopeBaseSchema.entries,
  causedByCommandId: CommandIdSchema,
  type: v.literal('game.command'),
  payload: GameCommandPayloadSchema,
})

export const FrameCompletedFactSchema = v.object({
  ...MatchFactEnvelopeBaseSchema.entries,
  causedByCommandId: CommandIdSchema,
  type: v.literal('frame.completed'),
  payload: FrameCompletedPayloadSchema,
})

export const MatchEndedFactSchema = v.object({
  ...MatchFactEnvelopeBaseSchema.entries,
  causedByCommandId: CommandIdSchema,
  type: v.literal('match.ended'),
  payload: MatchEndedPayloadSchema,
})

export const MatchFactSchema = v.variant('type', [
  MatchCreatedFactSchema,
  FrameStartedFactSchema,
  GameCommandFactSchema,
  FrameCompletedFactSchema,
  MatchEndedFactSchema,
])

export type MatchFact = v.InferOutput<typeof MatchFactSchema>

export const StoredMatchFactSchema = v.pipe(
  v.intersect([
    MatchFactSchema,
    v.object({
      seq: PositiveIntegerSchema,
      receivedAt: UnixEpochMillisecondsSchema,
    }),
  ]),
  v.check(
    (fact) => fact.type !== 'match.created' || fact.matchId === fact.payload.matchId,
    'Stored match.created envelope and payload match IDs must agree',
  ),
)

export type StoredMatchFact = v.InferOutput<typeof StoredMatchFactSchema>

export const AcceptedFactRefSchema = v.object({
  seq: PositiveIntegerSchema,
  factId: FactIdSchema,
})
export type AcceptedFactRef = v.InferOutput<typeof AcceptedFactRefSchema>

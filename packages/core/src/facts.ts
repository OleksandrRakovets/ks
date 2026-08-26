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
export const ProtocolEntryTypeSchema = v.picklist(['player-command', 'system-note', 'correction'])

export const ProtocolEntrySchema = v.object({
  source: ProtocolEntrySourceSchema,
  entryType: ProtocolEntryTypeSchema,
  seat: v.optional(SeatSchema),
  scoreAfter: v.optional(BySeatNumberSchema),
  body: UnknownObjectSchema,
})
export type ProtocolEntry = v.InferOutput<typeof ProtocolEntrySchema>

const FramePreparedPayloadSchema = v.object({
  frameIndex: PositiveIntegerSchema,
  gameKey: GameKeySchema,
  targetPointsBySeat: BySeatNumberSchema,
  breakerSeat: SeatSchema,
  gameConfiguration: v.optional(GameConfigurationSchema),
})

const GameCommandPayloadSchema = v.object({
  frameIndex: PositiveIntegerSchema,
  gameKey: GameKeySchema,
  commandType: SizedStringSchema(1, 64),
  command: UnknownObjectSchema,
  protocolEntries: v.pipe(v.array(ProtocolEntrySchema), v.minLength(1)),
})

const FrameCompletedPayloadSchema = v.object({
  frameIndex: PositiveIntegerSchema,
  gameKey: GameKeySchema,
  outcome: FrameOutcomeSchema,
})

const MatchEndedPayloadSchema = v.object({
  winnerSeat: SeatSchema,
})

const MatchCreatedContentSchema = v.object({
  type: v.literal('match.created'),
  payload: MatchConfigSchema,
})

const FramePreparedContentSchema = v.object({
  type: v.literal('frame.prepared'),
  payload: FramePreparedPayloadSchema,
})

const GameCommandContentSchema = v.object({
  type: v.literal('game.command'),
  payload: GameCommandPayloadSchema,
})

const FrameCompletedContentSchema = v.object({
  type: v.literal('frame.completed'),
  payload: FrameCompletedPayloadSchema,
})

const MatchEndedContentSchema = v.object({
  type: v.literal('match.ended'),
  payload: MatchEndedPayloadSchema,
})

export const MatchFactContentSchema = v.variant('type', [
  MatchCreatedContentSchema,
  FramePreparedContentSchema,
  GameCommandContentSchema,
  FrameCompletedContentSchema,
  MatchEndedContentSchema,
])

export type MatchFactContent = v.InferOutput<typeof MatchFactContentSchema>

/** Semantic facts produced atomically by one accepted match command. */
export type MatchFactContentBatch = readonly [MatchFactContent, ...MatchFactContent[]]

/** Accepted semantic history, beginning with a singleton match.created batch. */
export type MatchFactContentHistory = readonly [MatchFactContentBatch, ...MatchFactContentBatch[]]

const MatchFactEnvelopeBaseSchema = v.object({
  factId: FactIdSchema,
  matchId: MatchIdSchema,
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

export const FramePreparedFactSchema = v.object({
  ...MatchFactEnvelopeBaseSchema.entries,
  causedByCommandId: CommandIdSchema,
  type: v.literal('frame.prepared'),
  payload: FramePreparedPayloadSchema,
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
  FramePreparedFactSchema,
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
      acceptedAt: UnixEpochMillisecondsSchema,
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

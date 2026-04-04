import { z } from 'zod'

import { StoredEventSchema } from './events'
import { EventIdSchema } from './ids'
import { HydratedMatchParticipantsSchema, MatchSnapshotSchema } from './match'

export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1),
})

export const SnapshotResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    snapshot: MatchSnapshotSchema,
    participants: HydratedMatchParticipantsSchema,
  }),
  ErrorResponseSchema,
])

export const AcceptedEventSchema = z.object({
  seq: z.number().int().positive(),
  eventId: EventIdSchema,
})

export const PostEventsResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    accepted: z.array(AcceptedEventSchema),
  }),
  ErrorResponseSchema,
])

export const StreamReadySchema = z.object({
  latestSeq: z.number().int().nonnegative(),
})

export const StreamEventSchema = StoredEventSchema

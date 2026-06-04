import { z } from 'zod'

import { StoredFactSchema } from './facts'
import { FactIdSchema } from './ids'
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
    controlProjection: z.unknown().optional(),
  }),
  ErrorResponseSchema,
])

export const AcceptedFactSchema = z.object({
  seq: z.number().int().positive(),
  factId: FactIdSchema,
})

export const PostFactsResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    accepted: z.array(AcceptedFactSchema),
  }),
  ErrorResponseSchema,
])

export const StreamReadySchema = z.object({
  latestSeq: z.number().int().nonnegative(),
})

export const StreamFactSchema = StoredFactSchema

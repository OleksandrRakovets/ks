import { CreateMatchRequestSchema } from '@ks/competition'
import {
  CommandIdSchema,
  ControlCommandSchema,
  MatchIdSchema,
  NonNegativeIntegerSchema,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import * as v from 'valibot'

import type { CommandReceiptOutcome } from './storage/command-outcome'

const ControlSecretSchema = v.pipe(v.string(), v.minLength(16))

export const CreateBodySchema = v.intersect([
  CreateMatchRequestSchema,
  v.object({
    matchId: MatchIdSchema,
    controlSecret: ControlSecretSchema,
    createdAt: UnixEpochMillisecondsSchema,
  }),
])

export const SubmitCommandBodySchema = v.object({
  matchId: MatchIdSchema,
  commandId: CommandIdSchema,
  command: ControlCommandSchema,
})

export const MatchIdBodySchema = v.object({
  matchId: MatchIdSchema,
})

export const StreamBodySchema = v.object({
  matchId: MatchIdSchema,
  since: v.optional(NonNegativeIntegerSchema),
})

export type CreateBody = v.InferInput<typeof CreateBodySchema>
export type SubmitCommandBody = v.InferInput<typeof SubmitCommandBodySchema>
export type MatchIdBody = v.InferInput<typeof MatchIdBodySchema>
export type StreamBody = v.InferInput<typeof StreamBodySchema>

export type SubmitCommandResult =
  | {
      readonly ok: true
      readonly outcome: CommandReceiptOutcome
      readonly finalizing?: true
    }
  | {
      readonly ok: false
      readonly error: 'invalid-command-body' | 'unknown-match' | 'command-id-conflict' | 'match-locked'
      readonly status: number
    }

export function canonicalCommandJson(command: v.InferOutput<typeof ControlCommandSchema>): string {
  return JSON.stringify(v.parse(ControlCommandSchema, command))
}

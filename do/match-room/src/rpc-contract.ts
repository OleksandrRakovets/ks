import { CreateMatchRequestSchema } from '@ks/competition'
import { MatchCommand, MatchId, NonNegativeInteger, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import type { CommandReceipt } from './storage/match-storage'

const ControlSecretSchema = v.pipe(v.string(), v.minLength(16))

export const CreateBodySchema = v.intersect([
  CreateMatchRequestSchema,
  v.object({
    matchId: MatchId,
    controlSecret: ControlSecretSchema,
    createdAt: UnixEpochMilliseconds,
  }),
])

export const SubmitCommandBodySchema = v.object({
  matchId: MatchId,
  command: MatchCommand,
})

export const MatchIdBodySchema = v.object({
  matchId: MatchId,
})

export const StreamBodySchema = v.object({
  matchId: MatchId,
  since: v.optional(NonNegativeInteger),
})

export type CreateBody = v.InferInput<typeof CreateBodySchema>
export type SubmitCommandBody = v.InferInput<typeof SubmitCommandBodySchema>
export type MatchIdBody = v.InferInput<typeof MatchIdBodySchema>
export type StreamBody = v.InferInput<typeof StreamBodySchema>

export type SubmitCommandResult =
  | {
      readonly ok: true
      readonly outcome: CommandReceipt
      readonly finalizing?: true
    }
  | {
      readonly ok: false
      readonly error: 'invalid-command-body' | 'unknown-match' | 'command-id-conflict' | 'match-locked'
      readonly status: number
    }

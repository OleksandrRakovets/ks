import { SparringMatchRejectionSchema } from '@ks/competition'
import { type CommandId, PositiveIntegerSchema } from '@ks/core'
import * as v from 'valibot'

export const CommandReceiptOutcomeSchema = v.variant('_tag', [
  v.object({
    _tag: v.literal('accepted'),
    acceptedSeq: PositiveIntegerSchema,
  }),
  v.object({
    _tag: v.literal('rejected'),
    reason: SparringMatchRejectionSchema,
  }),
])

export type CommandReceiptOutcome = v.InferOutput<typeof CommandReceiptOutcomeSchema>

export type StoredCommandOutcome = {
  readonly requestJson: string
  readonly outcome: CommandReceiptOutcome
}

export function decodeStoredCommandOutcome(
  row: { requestJson: string; outcome: string; acceptedSeq: number | null; rejectionJson: string | null },
  commandId: CommandId,
): StoredCommandOutcome {
  try {
    const outcome =
      row.outcome === 'accepted'
        ? { _tag: 'accepted' as const, acceptedSeq: row.acceptedSeq }
        : { _tag: 'rejected' as const, reason: JSON.parse(row.rejectionJson ?? '') }
    return { requestJson: row.requestJson, outcome: v.parse(CommandReceiptOutcomeSchema, outcome) }
  } catch {
    throw new Error(`MatchRoom commands storage corruption for command ${commandId}`)
  }
}

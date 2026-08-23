import { SparringMatchRejectionSchema } from '@ks/competition'
import { AcceptedFactRefSchema, type CommandId } from '@ks/core'
import * as v from 'valibot'

export const CommandReceiptOutcomeSchema = v.variant('_tag', [
  v.object({
    _tag: v.literal('accepted'),
    accepted: v.pipe(v.array(AcceptedFactRefSchema), v.minLength(1)),
  }),
  v.object({
    _tag: v.literal('rejected'),
    reason: SparringMatchRejectionSchema,
  }),
])

export type CommandReceiptOutcome = v.InferOutput<typeof CommandReceiptOutcomeSchema>

export type CommandReceipt = {
  readonly requestJson: string
  readonly outcome: CommandReceiptOutcome
}

export function encodeCommandReceiptOutcome(outcome: CommandReceiptOutcome): string {
  return JSON.stringify(v.parse(CommandReceiptOutcomeSchema, outcome))
}

export function decodeCommandReceiptOutcome(outcomeJson: string, commandId: CommandId): CommandReceiptOutcome {
  try {
    return v.parse(v.pipe(v.string(), v.parseJson(), CommandReceiptOutcomeSchema), outcomeJson)
  } catch {
    throw new Error(`MatchRoom command_receipts storage corruption for command ${commandId}`)
  }
}

export function decodeCommandReceiptRow(
  row: { requestJson: string; outcomeJson: string },
  commandId: CommandId,
): CommandReceipt {
  return {
    requestJson: row.requestJson,
    outcome: decodeCommandReceiptOutcome(row.outcomeJson, commandId),
  }
}

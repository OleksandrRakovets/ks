import { describe, expect, test } from 'bun:test'

import { AcceptedFactRefSchema, CommandIdSchema, FactIdSchema } from '@ks/core'
import * as v from 'valibot'

import { CommandReceiptOutcomeSchema, decodeCommandReceiptOutcome, encodeCommandReceiptOutcome } from './command-receipt'

const commandId = v.parse(CommandIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAC')
const factId = v.parse(FactIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAB')

const acceptedOutcome = {
  _tag: 'accepted' as const,
  accepted: [{ seq: 2, factId }],
}

const rejectedOutcomes = [
  { _tag: 'rejected' as const, reason: { code: 'no-active-frame' as const } },
  { _tag: 'rejected' as const, reason: { code: 'frame-already-active' as const } },
  { _tag: 'rejected' as const, reason: { code: 'wrong-breaker' as const, expectedSeat: 'A' as const } },
  { _tag: 'rejected' as const, reason: { code: 'match-already-over' as const } },
  {
    _tag: 'rejected' as const,
    reason: {
      code: 'game-command-rejected' as const,
      reason: { code: 'command-not-available' as const },
    },
  },
]

describe('command receipt outcome codec', () => {
  test('accepts every rejected variant and non-empty acceptance', () => {
    expect(v.parse(CommandReceiptOutcomeSchema, acceptedOutcome)).toEqual(acceptedOutcome)
    for (const outcome of rejectedOutcomes) {
      expect(v.parse(CommandReceiptOutcomeSchema, outcome)).toEqual(outcome)
    }
  })

  test('rejects empty accepted arrays and malformed tags', () => {
    expect(v.safeParse(CommandReceiptOutcomeSchema, { _tag: 'accepted', accepted: [] }).success).toBe(false)
    expect(v.safeParse(CommandReceiptOutcomeSchema, { _tag: 'unknown', accepted: [{ seq: 1, factId }] }).success).toBe(false)
    expect(
      v.safeParse(CommandReceiptOutcomeSchema, {
        _tag: 'rejected',
        reason: { code: 'unsupported-match-command', commandType: 'frame.start' },
      }).success,
    ).toBe(false)
  })

  test('rejects malformed accepted references', () => {
    expect(
      v.safeParse(CommandReceiptOutcomeSchema, {
        _tag: 'accepted',
        accepted: [{ seq: 0, factId }],
      }).success,
    ).toBe(false)
    expect(v.safeParse(AcceptedFactRefSchema, { seq: 1, factId: 'bad' }).success).toBe(false)
  })

  test('round-trips encoded outcomes', () => {
    for (const outcome of [acceptedOutcome, ...rejectedOutcomes]) {
      const encoded = encodeCommandReceiptOutcome(outcome)
      expect(decodeCommandReceiptOutcome(encoded, commandId)).toEqual(outcome)
    }
  })

  test('fails closed on persisted corruption with command ID diagnostics', () => {
    expect(() => decodeCommandReceiptOutcome('{', commandId)).toThrow(
      `MatchRoom command_receipts storage corruption for command ${commandId}`,
    )
    expect(() => decodeCommandReceiptOutcome(JSON.stringify({ _tag: 'accepted', accepted: [] }), commandId)).toThrow(
      `MatchRoom command_receipts storage corruption for command ${commandId}`,
    )
  })
})

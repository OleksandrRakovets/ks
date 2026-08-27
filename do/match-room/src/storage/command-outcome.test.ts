import { describe, expect, test } from 'bun:test'

import { newCommandId } from '@ks/core'

import { decodeStoredCommandOutcome } from './command-outcome'

describe('command row codec', () => {
  test('decodes accepted and rejected outcomes', () => {
    const id = newCommandId()
    expect(
      decodeStoredCommandOutcome({ requestJson: '{}', outcome: 'accepted', acceptedSeq: 2, rejectionJson: null }, id).outcome,
    ).toEqual({ _tag: 'accepted', acceptedSeq: 2 })
    expect(
      decodeStoredCommandOutcome(
        {
          requestJson: '{}',
          outcome: 'rejected',
          acceptedSeq: null,
          rejectionJson: JSON.stringify({ code: 'no-active-frame' }),
        },
        id,
      ).outcome,
    ).toEqual({ _tag: 'rejected', reason: { code: 'no-active-frame' } })
  })

  test('rejects inconsistent rows', () => {
    const id = newCommandId()
    expect(() =>
      decodeStoredCommandOutcome({ requestJson: '{}', outcome: 'accepted', acceptedSeq: null, rejectionJson: null }, id),
    ).toThrow('MatchRoom commands storage corruption')
  })
})

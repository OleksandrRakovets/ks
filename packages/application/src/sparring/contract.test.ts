import { describe, expect, test } from 'bun:test'

import { Result, Schema } from 'effect'
import * as v from 'valibot'

import { CreateSparringMatchInput, MatchListDay } from './contract'

const baseInput = {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 3 },
  firstBreakerSeat: 'A',
  playerNames: { A: 'Alice', B: 'Bob' },
}

describe('application match creation input', () => {
  test('accepts a 127-character normalized name whose generated short form reaches the canonical 128 limit', () => {
    const name = `A ${'x'.repeat(125)}`

    const parsed = v.parse(CreateSparringMatchInput, {
      ...baseInput,
      playerNames: { A: ` ${name} `, B: 'Bob' },
    })

    expect(parsed.playerNames.A).toBe(name)
    expect(parsed.playerNames.A.length).toBe(127)
  })

  test('rejects empty and 128-character normalized creation names', () => {
    expect(
      v.safeParse(CreateSparringMatchInput, { ...baseInput, playerNames: { A: ' ', B: 'Bob' } }).success,
    ).toBe(false)
    expect(
      v.safeParse(CreateSparringMatchInput, {
        ...baseInput,
        playerNames: { A: `A ${'x'.repeat(126)}`, B: 'Bob' },
      }).success,
    ).toBe(false)
  })
})

describe('match list day', () => {
  test.each(['1970-01-01', '2000-02-29', '2028-02-29', '9999-12-31'])(
    'accepts %s without changing its representation',
    (day) => {
      expect(Schema.decodeUnknownSync(MatchListDay)(day)).toBe(day)
    },
  )

  test.each([
    '1969-12-31',
    '2100-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-01-00',
    '2026-9-23',
    '2026-09-23T00:00:00Z',
    ' 2026-09-23 ',
    '',
  ])('rejects %s rather than normalizing it', (day) => {
    expect(Result.isFailure(Schema.decodeUnknownResult(MatchListDay)(day))).toBe(true)
  })

  test('rejects non-string input', () => {
    for (const input of [null, undefined, 20260923, { day: '2026-09-23' }]) {
      expect(Result.isFailure(Schema.decodeUnknownResult(MatchListDay)(input))).toBe(true)
    }
  })
})

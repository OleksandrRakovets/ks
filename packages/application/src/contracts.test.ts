import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { CreateMatchInputSchema } from './contracts'

const baseInput = {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 3 },
  firstBreakerSeat: 'A',
  playerNames: { A: 'Alice', B: 'Bob' },
}

describe('application match creation input', () => {
  test('accepts a 127-character normalized name whose generated short form reaches the canonical 128 limit', () => {
    const name = `A ${'x'.repeat(125)}`
    const parsed = v.parse(CreateMatchInputSchema, { ...baseInput, playerNames: { A: ` ${name} `, B: 'Bob' } })

    expect(parsed.playerNames.A).toBe(name)
    expect(parsed.playerNames.A.length).toBe(127)
  })

  test('rejects empty and 128-character normalized creation names', () => {
    expect(v.safeParse(CreateMatchInputSchema, { ...baseInput, playerNames: { A: ' ', B: 'Bob' } }).success).toBe(false)
    expect(
      v.safeParse(CreateMatchInputSchema, {
        ...baseInput,
        playerNames: { A: `A ${'x'.repeat(126)}`, B: 'Bob' },
      }).success,
    ).toBe(false)
  })
})

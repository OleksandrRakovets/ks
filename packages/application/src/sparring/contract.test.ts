import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { CreateSparringMatchInput } from './contract'

const baseInput = {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 3 },
  firstBreakerSeat: 'A',
  playerNames: { A: 'Alice', B: 'Bob' },
}

describe('application match creation input', () => {
  test('accepts a 36-character normalized name', () => {
    const name = `A ${'x'.repeat(34)}`

    const parsed = v.parse(CreateSparringMatchInput, {
      ...baseInput,
      playerNames: { A: ` ${name} `, B: 'Bob' },
    })

    expect(parsed.playerNames.A).toBe(name)
    expect(parsed.playerNames.A.length).toBe(36)
  })

  test('rejects empty and 37-character normalized creation names', () => {
    expect(
      v.safeParse(CreateSparringMatchInput, { ...baseInput, playerNames: { A: ' ', B: 'Bob' } }).success,
    ).toBe(false)
    expect(
      v.safeParse(CreateSparringMatchInput, {
        ...baseInput,
        playerNames: { A: `A ${'x'.repeat(35)}`, B: 'Bob' },
      }).success,
    ).toBe(false)
  })
})

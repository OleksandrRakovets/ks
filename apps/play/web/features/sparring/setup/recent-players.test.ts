import { expect, test } from 'bun:test'

import { UnixEpochMilliseconds } from '@ks/core'
import { Schema } from 'effect'

import { recentPlayerSuggestions, rememberRecentPlayers } from './recent-players'

test('recent players strip stored extras, cap suggestions, and normalize remembered names without changing JSON', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  const values = new Map<string, string>([
    [
      'ks.sparring.recentPlayers.v1',
      JSON.stringify({
        version: 1,
        extra: true,
        players: ['Alice Smith', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'].map((name, index) => ({
          name,
          lastUsedAt: 100 - index,
          extra: true,
        })),
      }),
    ],
  ])

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    },
  })

  try {
    rememberRecentPlayers(['  ALICE\tSmith ', '  '])
    const serialized = values.get('ks.sparring.recentPlayers.v1')

    if (serialized === undefined) throw new Error('Expected stored recent players')

    const stored: unknown = JSON.parse(serialized)
    const timestamp: unknown = expect.any(Number)

    expect(stored).toEqual({
      version: 1,
      players: [
        { name: 'ALICE Smith', lastUsedAt: timestamp },
        { name: 'Bob', lastUsedAt: 99 },
        { name: 'Carol', lastUsedAt: 98 },
        { name: 'Dave', lastUsedAt: 97 },
        { name: 'Eve', lastUsedAt: 96 },
      ],
    })
    expect(
      recentPlayerSuggestions(
        [{ name: 'ALICE Smith', lastUsedAt: Schema.decodeUnknownSync(UnixEpochMilliseconds)(0) }],
        ' alice   smith ',
      ),
    ).toEqual([])
  } finally {
    if (originalStorage === undefined) Reflect.deleteProperty(globalThis, 'localStorage')
    else Object.defineProperty(globalThis, 'localStorage', originalStorage)
  }
})

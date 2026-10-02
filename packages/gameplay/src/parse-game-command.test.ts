import { describe, expect, test } from 'bun:test'

import { Seat } from '@ks/core'
import { Schema } from 'effect'

import { parseGameCommand } from './parse-game-command'
import { type GameKey, listGameKeys } from './registry'

type GameKey = typeof GameKey.Type

const strilaValidCommands = [
  { type: 'frame.commence', seat: 'A' },
  { type: 'respotted-black.opening.select', seat: 'B' },
  { type: 'pot.record', seat: 'A', pottedBalls: [1] },
  { type: 'miss.record', seat: 'A' },
  { type: 'foul.commit', seat: 'A' },
  { type: 'penalty.select', seat: 'B', choice: 'ball-in-hand' },
  { type: 'frame.award', seat: 'A' },
] as const

const pyramidValidCommands = [
  { type: 'frame.commence', seat: 'A' },
  { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  { type: 'foul.commit', seat: 'A' },
  { type: 'frame.award', seat: 'A' },
] as const

const longValidCommands = [
  { type: 'frame.commence', seat: 'A' },
  { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  { type: 'foul.commit', seat: 'A' },
  { type: 'frame.award', seat: 'A' },
] as const

const validCommandsByKey = {
  'strila-v2': strilaValidCommands,
  'free-pyramid': pyramidValidCommands,
  'combined-pyramid': pyramidValidCommands,
  'combined-pyramid-old': pyramidValidCommands,
  'free-pyramid-long': longValidCommands,
} as const satisfies Record<GameKey, readonly { type: string }[]>

function representativePotCommand(gameKey: GameKey) {
  if (gameKey === 'strila-v2') return { type: 'pot.record', seat: 'A', pottedBalls: [1] }

  if (gameKey === 'free-pyramid-long') return { type: 'pot.record', seat: 'A', pottedBallCount: 2 }

  return { type: 'pot.record', seat: 'A', pottedBallCount: 1 }
}

describe('parseGameCommand', () => {
  // SAFETY: validCommandsByKey is exhaustively keyed by GameKey above.
  const gameKeys = Object.keys(validCommandsByKey) as GameKey[]
  test.each(gameKeys)('%s parses every valid command without changing its shape', (gameKey) => {
    for (const input of validCommandsByKey[gameKey]) {
      const parsed = parseGameCommand(gameKey, input)
      expect(parsed).toMatchObject({ _tag: 'parsed', command: input })
    }
  })

  test.each(listGameKeys())('%s rejects unknown command type', (gameKey) => {
    expect(parseGameCommand(gameKey, { type: 'match.end' })._tag).toBe('game-command-parse-failure')
  })

  test.each(listGameKeys())('%s rejects unknown fields', (gameKey) => {
    for (const command of validCommandsByKey[gameKey]) {
      const result = parseGameCommand(gameKey, { ...command, extra: true })
      expect(result._tag).toBe('game-command-parse-failure')

      if (result._tag === 'game-command-parse-failure') {
        expect(result.gameKey).toBe(gameKey)
        expect(result.commandType).toBe(command.type)
        expect(Schema.isSchemaError(result.error)).toBe(true)
        expect(result.error.message).not.toBe('')
      }
    }
  })

  test.each(listGameKeys())('%s rejects missing required fields', (gameKey) => {
    expect(parseGameCommand(gameKey, { type: 'pot.record' })._tag).toBe('game-command-parse-failure')
  })

  test.each(listGameKeys())('%s rejects invalid seat', (gameKey) => {
    const result = parseGameCommand(gameKey, { ...representativePotCommand(gameKey), seat: 'C' })
    expect(result._tag).toBe('game-command-parse-failure')
    expect(Schema.is(Seat)('C')).toBe(false)
  })

  test('Strila rejects duplicate, out-of-range, and empty ball selections', () => {
    for (const pottedBalls of [[1, 1], [8], []]) {
      expect(parseGameCommand('strila-v2', { type: 'pot.record', seat: 'A', pottedBalls })._tag).toBe(
        'game-command-parse-failure',
      )
    }
  })

  test('regular pyramid validates positive integer counts', () => {
    expect(parseGameCommand('free-pyramid', { type: 'pot.record', seat: 'A', pottedBallCount: 99 })._tag).toBe(
      'parsed',
    )

    for (const pottedBallCount of [0, -1, 1.5]) {
      expect(parseGameCommand('free-pyramid', { type: 'pot.record', seat: 'A', pottedBallCount })._tag).toBe(
        'game-command-parse-failure',
      )
    }
  })

  test('long free pyramid accepts only pottedBallCount 1 through 4', () => {
    for (const pottedBallCount of [1, 2, 3, 4]) {
      expect(
        parseGameCommand('free-pyramid-long', { type: 'pot.record', seat: 'A', pottedBallCount })._tag,
      ).toBe('parsed')
    }

    for (const pottedBallCount of [0, 5, -1, 1.5]) {
      expect(
        parseGameCommand('free-pyramid-long', { type: 'pot.record', seat: 'A', pottedBallCount })._tag,
      ).toBe('game-command-parse-failure')
    }
  })
})

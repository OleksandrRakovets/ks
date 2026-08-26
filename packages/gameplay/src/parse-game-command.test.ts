import { describe, expect, test } from 'bun:test'

import { SeatSchema } from '@ks/core'
import * as v from 'valibot'

import { canonicalGameCommandPayload } from './command-schemas'
import { parseGameCommand } from './parse-game-command'
import { listGameKeys, type RegisteredGameKey } from './registry'

const strilaValidCommands = [
  { commandType: 'frame.commence', command: { seat: 'A' } },
  { commandType: 'pot.record', command: { seat: 'A', pottedBalls: [1] } },
  { commandType: 'miss.record', command: { seat: 'A' } },
  { commandType: 'foul.commit', command: { seat: 'A' } },
  { commandType: 'penalty.select', command: { seat: 'B', choice: 'ball-in-hand' } },
  { commandType: 'frame.award', command: { seat: 'A' } },
] as const

const pyramidValidCommands = [
  { commandType: 'frame.commence', command: { seat: 'A' } },
  { commandType: 'pot.record', command: { seat: 'A', pottedBallCount: 1 } },
  { commandType: 'foul.commit', command: { seat: 'A' } },
  { commandType: 'frame.award', command: { seat: 'A' } },
] as const

const longValidCommands = [
  { commandType: 'frame.commence', command: { seat: 'A' } },
  { commandType: 'pot.record', command: { seat: 'A', pottedBallCount: 1 } },
  { commandType: 'foul.commit', command: { seat: 'A' } },
  { commandType: 'frame.award', command: { seat: 'A' } },
] as const

const validCommandsByKey = {
  'strila-v2': strilaValidCommands,
  'free-pyramid': pyramidValidCommands,
  'combined-pyramid': pyramidValidCommands,
  'combined-pyramid-old': pyramidValidCommands,
  'free-pyramid-long': longValidCommands,
} as const satisfies Record<RegisteredGameKey, readonly { commandType: string; command: object }[]>

function representativePotCommand(gameKey: RegisteredGameKey) {
  switch (gameKey) {
    case 'strila-v2':
      return { commandType: 'pot.record', command: { seat: 'A', pottedBalls: [1] } }
    case 'free-pyramid-long':
      return { commandType: 'pot.record', command: { seat: 'A', pottedBallCount: 2 } }
    default:
      return { commandType: 'pot.record', command: { seat: 'A', pottedBallCount: 1 } }
  }
}

describe('parseGameCommand', () => {
  // SAFETY: validCommandsByKey is keyed by every RegisteredGameKey from listGameKeys().
  const gameKeys = Object.keys(validCommandsByKey) as RegisteredGameKey[]
  test.each(gameKeys)('%s parses every valid command and canonicalizes payload', (gameKey) => {
    for (const input of validCommandsByKey[gameKey]) {
      const parsed = parseGameCommand(gameKey, input)
      expect(parsed._tag).toBe('parsed')
      if (parsed._tag !== 'parsed') throw new Error('expected parsed')
      expect(parsed.command.type).toBe(input.commandType)
      expect(canonicalGameCommandPayload(parsed.command)).toEqual(input.command)
    }
  })

  test.each(listGameKeys())('%s rejects unknown command type', (gameKey) => {
    expect(parseGameCommand(gameKey, { commandType: 'match.end', command: {} })._tag).toBe('game-command-parse-failure')
  })

  test.each(listGameKeys())('%s rejects non-object payload', (gameKey) => {
    const input = representativePotCommand(gameKey)
    expect(parseGameCommand(gameKey, { ...input, command: null })._tag).toBe('game-command-parse-failure')
  })

  test.each(listGameKeys())('%s rejects payload-supplied type', (gameKey) => {
    const input = representativePotCommand(gameKey)
    expect(
      parseGameCommand(gameKey, {
        commandType: input.commandType,
        command: { ...input.command, type: input.commandType },
      })._tag,
    ).toBe('game-command-parse-failure')
  })

  test.each(listGameKeys())('%s rejects unknown fields', (gameKey) => {
    const input = representativePotCommand(gameKey)
    expect(parseGameCommand(gameKey, { commandType: input.commandType, command: { ...input.command, extra: true } })._tag).toBe(
      'game-command-parse-failure',
    )
  })

  test.each(listGameKeys())('%s rejects missing required fields', (gameKey) => {
    const input = representativePotCommand(gameKey)
    expect(parseGameCommand(gameKey, { commandType: input.commandType, command: {} })._tag).toBe('game-command-parse-failure')
  })

  test.each(listGameKeys())('%s rejects invalid seat', (gameKey) => {
    const input = representativePotCommand(gameKey)
    const invalidSeat = { ...input.command, seat: 'C' }
    const result = parseGameCommand(gameKey, { commandType: input.commandType, command: invalidSeat })
    expect(result._tag).toBe('game-command-parse-failure')
    expect(v.safeParse(SeatSchema, 'C').success).toBe(false)
  })

  test('Strila rejects duplicate and out-of-range balls', () => {
    expect(parseGameCommand('strila-v2', { commandType: 'pot.record', command: { seat: 'A', pottedBalls: [1, 1] } })._tag).toBe(
      'game-command-parse-failure',
    )
    expect(parseGameCommand('strila-v2', { commandType: 'pot.record', command: { seat: 'A', pottedBalls: [8] } })._tag).toBe(
      'game-command-parse-failure',
    )
    expect(parseGameCommand('strila-v2', { commandType: 'pot.record', command: { seat: 'A', pottedBalls: [] } })._tag).toBe(
      'game-command-parse-failure',
    )
  })

  test('regular pyramid accepts any positive integer count at parse time', () => {
    const parsed = parseGameCommand('free-pyramid', { commandType: 'pot.record', command: { seat: 'A', pottedBallCount: 99 } })
    expect(parsed._tag).toBe('parsed')
    const fractional = parseGameCommand('free-pyramid', {
      commandType: 'pot.record',
      command: { seat: 'A', pottedBallCount: 1.5 },
    })
    expect(fractional._tag).toBe('game-command-parse-failure')
  })

  test('regular pyramid rejects zero and negative pottedBallCount at parse time', () => {
    for (const pottedBallCount of [0, -1]) {
      expect(
        parseGameCommand('free-pyramid', { commandType: 'pot.record', command: { seat: 'A', pottedBallCount } })._tag,
      ).toBe('game-command-parse-failure')
    }
  })

  test('long free pyramid accepts each pottedBallCount literal 1 through 4', () => {
    for (const pottedBallCount of [1, 2, 3, 4] as const) {
      expect(
        parseGameCommand('free-pyramid-long', { commandType: 'pot.record', command: { seat: 'A', pottedBallCount } })._tag,
      ).toBe('parsed')
    }
  })

  test('long free pyramid rejects pottedBallCount outside 1 through 4', () => {
    for (const pottedBallCount of [0, 5, -1, 1.5]) {
      expect(
        parseGameCommand('free-pyramid-long', { commandType: 'pot.record', command: { seat: 'A', pottedBallCount } })._tag,
      ).toBe('game-command-parse-failure')
    }
  })
})

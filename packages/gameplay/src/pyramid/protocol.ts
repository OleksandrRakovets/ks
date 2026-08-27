import { GameProtocolEntry, PositiveInteger } from '@ks/core'
import * as v from 'valibot'

import type { PyramidCommand } from './definitions'
import type { PyramidSparringFrameSnapshot } from './machine'
import type { PyramidRules } from './rules'

const PyramidProtocolEntryBodySchema = v.variant('commandType', [
  v.strictObject({ commandType: v.literal('frame.commence') }),
  v.strictObject({ commandType: v.literal('pot.record'), pottedBallCount: PositiveInteger }),
  v.strictObject({
    commandType: v.literal('foul.commit'),
    penalty: v.picklist(['opponent-plus-one', 'offender-minus-one']),
  }),
  v.strictObject({ commandType: v.literal('frame.award') }),
])

export const PyramidProtocolEntry = v.object({
  ...GameProtocolEntry.entries,
  body: PyramidProtocolEntryBodySchema,
})
export type PyramidProtocolEntry = v.InferOutput<typeof PyramidProtocolEntry>

function scoreChanged(previous: PyramidSparringFrameSnapshot, next: PyramidSparringFrameSnapshot): boolean {
  return previous.context.score.A !== next.context.score.A || previous.context.score.B !== next.context.score.B
}

function protocolEntry(args: {
  gameKey: PyramidRules['gameKey']
  seat: 'A' | 'B'
  body: v.InferOutput<typeof PyramidProtocolEntryBodySchema>
  previous: PyramidSparringFrameSnapshot
  next: PyramidSparringFrameSnapshot
}) {
  return v.parse(PyramidProtocolEntry, {
    gameKey: args.gameKey,
    source: 'player',
    entryType: 'player-command',
    seat: args.seat,
    scoreAfter: scoreChanged(args.previous, args.next) ? { ...args.next.context.score } : undefined,
    body: args.body,
  })
}

export function createPyramidProtocolEntries(args: {
  previous: PyramidSparringFrameSnapshot
  command: PyramidCommand
  next: PyramidSparringFrameSnapshot
  rules: PyramidRules
}): [PyramidProtocolEntry] {
  const { previous, command, next, rules } = args

  switch (command.type) {
    case 'frame.commence':
      return [
        protocolEntry({
          gameKey: rules.gameKey,
          seat: command.seat,
          body: { commandType: 'frame.commence' },
          previous,
          next,
        }),
      ]
    case 'pot.record':
      return [
        protocolEntry({
          gameKey: rules.gameKey,
          seat: command.seat,
          body: { commandType: 'pot.record', pottedBallCount: command.pottedBallCount },
          previous,
          next,
        }),
      ]
    case 'foul.commit':
      return [
        protocolEntry({
          gameKey: rules.gameKey,
          seat: command.seat,
          body: { commandType: 'foul.commit', penalty: rules.foulPenalty },
          previous,
          next,
        }),
      ]
    case 'frame.award':
      return [
        protocolEntry({
          gameKey: rules.gameKey,
          seat: command.seat,
          body: { commandType: 'frame.award' },
          previous,
          next,
        }),
      ]
  }
}

import { IntegerSchema, ProtocolEntrySchema } from '@ks/core'
import * as v from 'valibot'

import type { PyramidCommand } from './definitions'
import type { PyramidSparringFrameSnapshot } from './machine'
import type { PyramidRules } from './rules'

const PyramidProtocolEntryBodySchema = v.variant('commandType', [
  v.object({ commandType: v.literal('frame.commence') }),
  v.object({ commandType: v.literal('pot.record'), points: IntegerSchema }),
  v.object({
    commandType: v.literal('foul.commit'),
    penalty: v.picklist(['opponent-plus-one', 'offender-minus-one']),
  }),
  v.object({ commandType: v.literal('frame.award') }),
])

const PyramidProtocolEntrySchema = v.object({
  ...ProtocolEntrySchema.entries,
  body: PyramidProtocolEntryBodySchema,
})

function scoreChanged(previous: PyramidSparringFrameSnapshot, next: PyramidSparringFrameSnapshot): boolean {
  return previous.context.score.A !== next.context.score.A || previous.context.score.B !== next.context.score.B
}

function protocolEntry(args: {
  seat: 'A' | 'B'
  body: v.InferOutput<typeof PyramidProtocolEntryBodySchema>
  previous: PyramidSparringFrameSnapshot
  next: PyramidSparringFrameSnapshot
}) {
  return v.parse(PyramidProtocolEntrySchema, {
    source: 'player',
    entryType: 'player-command',
    seat: args.seat,
    scoreAfter: scoreChanged(args.previous, args.next) ? { ...args.next.context.score } : undefined,
    body: args.body,
  })
}

export function projectPyramidProtocolEntries(args: {
  previous: PyramidSparringFrameSnapshot
  command: PyramidCommand
  next: PyramidSparringFrameSnapshot
  rules: PyramidRules
}) {
  const { previous, command, next, rules } = args

  switch (command.type) {
    case 'frame.commence':
      return [
        protocolEntry({
          seat: command.seat,
          body: { commandType: 'frame.commence' },
          previous,
          next,
        }),
      ]
    case 'pot.record':
      return [
        protocolEntry({
          seat: command.seat,
          body: { commandType: 'pot.record', points: command.points },
          previous,
          next,
        }),
      ]
    case 'foul.commit':
      return [
        protocolEntry({
          seat: command.seat,
          body: { commandType: 'foul.commit', penalty: rules.foulPenalty },
          previous,
          next,
        }),
      ]
    case 'frame.award':
      return [
        protocolEntry({
          seat: command.seat,
          body: { commandType: 'frame.award' },
          previous,
          next,
        }),
      ]
  }
}

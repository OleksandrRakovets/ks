import { IntegerSchema, ProtocolEntrySchema } from '@ks/core'
import * as v from 'valibot'

import type { PyramidCommand } from './definitions'
import type { PyramidFrameState } from './definitions'
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

function scoreChanged(previous: PyramidFrameState, next: PyramidFrameState): boolean {
  return previous.pointsBySeat.A !== next.pointsBySeat.A || previous.pointsBySeat.B !== next.pointsBySeat.B
}

function protocolEntry(args: {
  seat: 'A' | 'B'
  body: v.InferOutput<typeof PyramidProtocolEntryBodySchema>
  previous: PyramidFrameState
  next: PyramidFrameState
}) {
  return v.parse(PyramidProtocolEntrySchema, {
    source: 'player',
    entryType: 'player-command',
    seat: args.seat,
    scoreAfter: scoreChanged(args.previous, args.next) ? args.next.pointsBySeat : undefined,
    body: args.body,
  })
}

export function projectPyramidProtocolEntries(args: {
  previous: PyramidFrameState
  command: PyramidCommand
  next: PyramidFrameState
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

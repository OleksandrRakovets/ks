import { IntegerSchema, ProtocolEntrySchema } from '@ks/core'
import * as v from 'valibot'

import { totalScore } from './calculations'
import type { LongFreePyramidCommand, LongFreePyramidFrameState } from './definitions'

const LongFreePyramidProtocolEntryBodySchema = v.variant('commandType', [
  v.object({ commandType: v.literal('frame.commence') }),
  v.object({ commandType: v.literal('pot.record'), points: IntegerSchema }),
  v.object({ commandType: v.literal('foul.commit'), penalty: v.literal('opponent-plus-one') }),
  v.object({ commandType: v.literal('frame.award') }),
])

const LongFreePyramidProtocolEntrySchema = v.object({
  ...ProtocolEntrySchema.entries,
  body: LongFreePyramidProtocolEntryBodySchema,
})

function scoreChanged(previous: LongFreePyramidFrameState, next: LongFreePyramidFrameState): boolean {
  const previousScore = totalScore(previous.racks)
  const nextScore = totalScore(next.racks)
  return previousScore.A !== nextScore.A || previousScore.B !== nextScore.B
}

function protocolEntry(args: {
  seat: 'A' | 'B'
  body: v.InferOutput<typeof LongFreePyramidProtocolEntryBodySchema>
  previous: LongFreePyramidFrameState
  next: LongFreePyramidFrameState
}) {
  const nextScore = totalScore(args.next.racks)
  return v.parse(LongFreePyramidProtocolEntrySchema, {
    source: 'player',
    entryType: 'player-command',
    seat: args.seat,
    scoreAfter: scoreChanged(args.previous, args.next) ? nextScore : undefined,
    body: args.body,
  })
}

export function projectLongFreePyramidProtocolEntries(args: {
  previous: LongFreePyramidFrameState
  command: LongFreePyramidCommand
  next: LongFreePyramidFrameState
}) {
  const { previous, command, next } = args

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
          body: { commandType: 'foul.commit', penalty: 'opponent-plus-one' },
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

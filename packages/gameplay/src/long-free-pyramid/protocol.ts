import { GameProtocolEntry, PositiveIntegerSchema } from '@ks/core'
import * as v from 'valibot'

import { totalScore } from './calculations'
import type { LongFreePyramidCommand } from './definitions'
import type { LongFreePyramidSparringFrameSnapshot } from './machine'

const LongFreePyramidProtocolEntryBodySchema = v.variant('commandType', [
  v.strictObject({ commandType: v.literal('frame.commence') }),
  v.strictObject({ commandType: v.literal('pot.record'), pottedBallCount: PositiveIntegerSchema }),
  v.strictObject({ commandType: v.literal('foul.commit'), penalty: v.literal('opponent-plus-one') }),
  v.strictObject({ commandType: v.literal('frame.award') }),
])

export const LongFreePyramidProtocolEntry = v.object({
  ...GameProtocolEntry.entries,
  body: LongFreePyramidProtocolEntryBodySchema,
})
export type LongFreePyramidProtocolEntry = v.InferOutput<typeof LongFreePyramidProtocolEntry>

function scoreChanged(previous: LongFreePyramidSparringFrameSnapshot, next: LongFreePyramidSparringFrameSnapshot): boolean {
  const previousScore = totalScore(previous.context.racks)
  const nextScore = totalScore(next.context.racks)
  return previousScore.A !== nextScore.A || previousScore.B !== nextScore.B
}

function protocolEntry(args: {
  seat: 'A' | 'B'
  body: v.InferOutput<typeof LongFreePyramidProtocolEntryBodySchema>
  previous: LongFreePyramidSparringFrameSnapshot
  next: LongFreePyramidSparringFrameSnapshot
}) {
  const nextScore = totalScore(args.next.context.racks)
  return v.parse(LongFreePyramidProtocolEntry, {
    gameKey: 'free-pyramid-long',
    source: 'player',
    entryType: 'player-command',
    seat: args.seat,
    scoreAfter: scoreChanged(args.previous, args.next) ? nextScore : undefined,
    body: args.body,
  })
}

export function projectLongFreePyramidProtocolEntries(args: {
  previous: LongFreePyramidSparringFrameSnapshot
  command: LongFreePyramidCommand
  next: LongFreePyramidSparringFrameSnapshot
}): [LongFreePyramidProtocolEntry] {
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
          body: { commandType: 'pot.record', pottedBallCount: command.pottedBallCount },
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

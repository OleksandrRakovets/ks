import { PositiveInteger } from '@ks/core'
import * as v from 'valibot'

import { GameProtocolEntryFields } from '../constants'
import { totalScore } from './calculations'
import type { LongFreePyramidCommand } from './definitions'
import type { LongFreePyramidFrameSnapshot } from './machine'

const LongFreePyramidProtocolEntryBody = v.variant('commandType', [
  v.pipe(v.strictObject({ commandType: v.literal('frame.commence') }), v.readonly()),
  v.pipe(
    v.strictObject({ commandType: v.literal('pot.record'), pottedBallCount: PositiveInteger }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({ commandType: v.literal('foul.commit'), penalty: v.literal('opponent-plus-one') }),
    v.readonly(),
  ),
  v.pipe(v.strictObject({ commandType: v.literal('frame.award') }), v.readonly()),
])

type LongFreePyramidProtocolEntryBody = v.InferOutput<typeof LongFreePyramidProtocolEntryBody>

export const LongFreePyramidProtocolEntry = v.pipe(
  v.object({
    ...GameProtocolEntryFields,
    gameKey: v.literal('free-pyramid-long'),
    body: LongFreePyramidProtocolEntryBody,
  }),
  v.readonly(),
)

export type LongFreePyramidProtocolEntry = v.InferOutput<typeof LongFreePyramidProtocolEntry>

function scoreChanged(previous: LongFreePyramidFrameSnapshot, next: LongFreePyramidFrameSnapshot): boolean {
  const previousScore = totalScore(previous.context.racks)
  const nextScore = totalScore(next.context.racks)

  return previousScore.A !== nextScore.A || previousScore.B !== nextScore.B
}

function protocolEntry(args: {
  readonly seat: 'A' | 'B'
  readonly body: LongFreePyramidProtocolEntryBody
  readonly previous: LongFreePyramidFrameSnapshot
  readonly next: LongFreePyramidFrameSnapshot
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

export function createLongFreePyramidProtocolEntries(args: {
  readonly previous: LongFreePyramidFrameSnapshot
  readonly command: LongFreePyramidCommand
  readonly next: LongFreePyramidFrameSnapshot
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

  throw new Error('Unsupported long free pyramid command')
}

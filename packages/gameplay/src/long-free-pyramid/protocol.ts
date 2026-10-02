import { PositiveInteger, StrictStruct } from '@ks/core'
import { Schema } from 'effect'

import { GameProtocolEntryFields } from '../constants'
import { totalScore } from './calculations'
import type { LongFreePyramidCommand } from './definitions'
import type { LongFreePyramidFrameSnapshot } from './machine'

const LongFreePyramidProtocolEntryBody = Schema.Union([
  StrictStruct({ commandType: Schema.Literal('frame.commence') }),
  StrictStruct({ commandType: Schema.Literal('pot.record'), pottedBallCount: PositiveInteger }),
  StrictStruct({
    commandType: Schema.Literal('foul.commit'),
    penalty: Schema.Literal('opponent-plus-one'),
  }),
  StrictStruct({ commandType: Schema.Literal('frame.award') }),
])

type LongFreePyramidProtocolEntryBody = typeof LongFreePyramidProtocolEntryBody.Type

export const LongFreePyramidProtocolEntry = Schema.Struct({
  ...GameProtocolEntryFields,
  gameKey: Schema.Literal('free-pyramid-long'),
  entryType: Schema.Literal('player-command'),
  body: LongFreePyramidProtocolEntryBody,
})

type LongFreePyramidProtocolEntry = typeof LongFreePyramidProtocolEntry.Type

type LongFreePyramidCommand = typeof LongFreePyramidCommand.Type

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
}): LongFreePyramidProtocolEntry {
  const nextScore = totalScore(args.next.context.racks)

  return {
    gameKey: 'free-pyramid-long',
    source: 'player',
    entryType: 'player-command',
    seat: args.seat,
    scoreAfter: scoreChanged(args.previous, args.next) ? nextScore : undefined,
    body: args.body,
  }
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

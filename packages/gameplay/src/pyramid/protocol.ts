import { PositiveInteger, StrictStruct } from '@ks/core'
import { Schema } from 'effect'

import { GameProtocolEntryFields } from '../constants'
import type { PyramidCommand } from './definitions'
import type { PyramidFrameSnapshot } from './machine'
import type { PyramidRules } from './rules'

const PyramidProtocolEntryBody = Schema.Union([
  StrictStruct({ commandType: Schema.Literal('frame.commence') }),
  StrictStruct({ commandType: Schema.Literal('pot.record'), pottedBallCount: PositiveInteger }),
  StrictStruct({
    commandType: Schema.Literal('foul.commit'),
    penalty: Schema.Literals(['opponent-plus-one', 'offender-minus-one']),
  }),
  StrictStruct({ commandType: Schema.Literal('frame.award') }),
])

type PyramidProtocolEntryBody = typeof PyramidProtocolEntryBody.Type

export const PyramidProtocolEntry = Schema.Struct({
  ...GameProtocolEntryFields,
  gameKey: Schema.Literals(['free-pyramid', 'combined-pyramid', 'combined-pyramid-old']),
  entryType: Schema.Literal('player-command'),
  body: PyramidProtocolEntryBody,
})

type PyramidProtocolEntry = typeof PyramidProtocolEntry.Type

type PyramidCommand = typeof PyramidCommand.Type

type PyramidRules = typeof PyramidRules.Type

function scoreChanged(previous: PyramidFrameSnapshot, next: PyramidFrameSnapshot): boolean {
  return previous.context.score.A !== next.context.score.A || previous.context.score.B !== next.context.score.B
}

function protocolEntry(args: {
  readonly gameKey: PyramidRules['gameKey']
  readonly seat: 'A' | 'B'
  readonly body: PyramidProtocolEntryBody
  readonly previous: PyramidFrameSnapshot
  readonly next: PyramidFrameSnapshot
}): PyramidProtocolEntry {
  return {
    gameKey: args.gameKey,
    source: 'player',
    entryType: 'player-command',
    seat: args.seat,
    scoreAfter: scoreChanged(args.previous, args.next) ? { ...args.next.context.score } : undefined,
    body: args.body,
  }
}

export function createPyramidProtocolEntries(args: {
  readonly previous: PyramidFrameSnapshot
  readonly command: PyramidCommand
  readonly next: PyramidFrameSnapshot
  readonly rules: PyramidRules
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

  throw new Error('Unsupported pyramid command')
}

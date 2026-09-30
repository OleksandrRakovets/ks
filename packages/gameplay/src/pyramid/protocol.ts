import { PositiveInteger } from '@ks/core'
import * as v from 'valibot'

import { GameProtocolEntryFields } from '../constants'
import type { PyramidCommand } from './definitions'
import type { PyramidFrameSnapshot } from './machine'
import type { PyramidRules } from './rules'

const PyramidProtocolEntryBody = v.variant('commandType', [
  v.pipe(v.strictObject({ commandType: v.literal('frame.commence') }), v.readonly()),
  v.pipe(
    v.strictObject({ commandType: v.literal('pot.record'), pottedBallCount: PositiveInteger }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({
      commandType: v.literal('foul.commit'),
      penalty: v.picklist(['opponent-plus-one', 'offender-minus-one']),
    }),
    v.readonly(),
  ),
  v.pipe(v.strictObject({ commandType: v.literal('frame.award') }), v.readonly()),
])

type PyramidProtocolEntryBody = v.InferOutput<typeof PyramidProtocolEntryBody>

export const PyramidProtocolEntry = v.pipe(
  v.object({
    ...GameProtocolEntryFields,
    gameKey: v.picklist(['free-pyramid', 'combined-pyramid', 'combined-pyramid-old']),
    entryType: v.literal('player-command'),
    body: PyramidProtocolEntryBody,
  }),
  v.readonly(),
)

export type PyramidProtocolEntry = v.InferOutput<typeof PyramidProtocolEntry>

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

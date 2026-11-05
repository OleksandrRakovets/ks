import { NonNegativeInteger, PositiveInteger, type Seat } from '@ks/core'
import * as v from 'valibot'

import { GameProtocolEntryFields, LongFreePyramidRack } from '../constants'
import { currentRack, removedByRack, totalScore } from './calculations'
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

/** Result of one finished rack: written on rollover and for the frame's final, partially cleared rack. */
const LongFreePyramidRackCompletedBody = v.pipe(
  v.strictObject({
    systemType: v.literal('rack-completed'),
    rackNumber: LongFreePyramidRack.entries.rackNumber,
    scoreBySeat: v.pipe(v.strictObject({ A: NonNegativeInteger, B: NonNegativeInteger }), v.readonly()),
  }),
  v.readonly(),
)

export const LongFreePyramidProtocolEntry = v.pipe(
  v.variant('entryType', [
    v.object({
      ...GameProtocolEntryFields,
      gameKey: v.literal('free-pyramid-long'),
      entryType: v.literal('player-command'),
      body: LongFreePyramidProtocolEntryBody,
    }),
    v.object({
      ...GameProtocolEntryFields,
      gameKey: v.literal('free-pyramid-long'),
      entryType: v.literal('system-note'),
      body: LongFreePyramidRackCompletedBody,
    }),
  ]),
  v.readonly(),
)

export type LongFreePyramidProtocolEntry = v.InferOutput<typeof LongFreePyramidProtocolEntry>

export function createLongFreePyramidProtocolEntries(args: {
  readonly previous: LongFreePyramidFrameSnapshot
  readonly command: LongFreePyramidCommand
  readonly next: LongFreePyramidFrameSnapshot
}): [LongFreePyramidProtocolEntry, ...LongFreePyramidProtocolEntry[]] {
  const { previous, command, next } = args

  const entries: [LongFreePyramidProtocolEntry, ...LongFreePyramidProtocolEntry[]] = [
    {
      gameKey: 'free-pyramid-long',
      source: 'player',
      entryType: 'player-command',
      seat: command.seat,
      scoreAfter: scoreChanged(previous, next) ? totalScore(next.context.racks) : undefined,
      body: playerBody(command),
    },
  ]

  // A rollover appends the next empty rack, so the rack before it is the one this command completed.
  const completedRack =
    next.context.racks.length > previous.context.racks.length ? next.context.racks.at(-2) : undefined

  if (completedRack !== undefined) entries.push(rackCompletedEntry(completedRack, command.seat))

  return entries
}

/**
 * Records the final rack when the frame ends, unless a rollover has just left it empty.
 * Together with rollover entries, the Protocol alone then lists every rack's result.
 */
export function createLongFreePyramidFrameEndProtocolEntries(
  snapshot: LongFreePyramidFrameSnapshot,
  seat: Seat,
): LongFreePyramidProtocolEntry[] {
  const rack = currentRack(snapshot.context.racks)

  return removedByRack(rack) === 0 ? [] : [rackCompletedEntry(rack, seat)]
}

function playerBody(command: LongFreePyramidCommand): LongFreePyramidProtocolEntryBody {
  switch (command.type) {
    case 'frame.commence':
    case 'frame.award':
      return { commandType: command.type }
    case 'pot.record':
      return { commandType: 'pot.record', pottedBallCount: command.pottedBallCount }
    case 'foul.commit':
      return { commandType: 'foul.commit', penalty: 'opponent-plus-one' }
  }

  throw new Error('Unsupported long free pyramid command')
}

function rackCompletedEntry(rack: LongFreePyramidRack, seat: Seat): LongFreePyramidProtocolEntry {
  return {
    gameKey: 'free-pyramid-long',
    source: 'system',
    entryType: 'system-note',
    seat,
    body: {
      systemType: 'rack-completed',
      rackNumber: rack.rackNumber,
      scoreBySeat: { A: rack.scoreBySeat.A, B: rack.scoreBySeat.B },
    },
  }
}

function scoreChanged(previous: LongFreePyramidFrameSnapshot, next: LongFreePyramidFrameSnapshot): boolean {
  const previousScore = totalScore(previous.context.racks)
  const nextScore = totalScore(next.context.racks)

  return previousScore.A !== nextScore.A || previousScore.B !== nextScore.B
}

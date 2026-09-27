import { BySeatNumber, FrameOutcome, MatchConfig, Seat } from '@ks/core'
import { GameResult } from '@ks/gameplay/definitions'
import { GameplayCheckpoint } from '@ks/gameplay/server'
import * as v from 'valibot'

export const MatchMachineCheckpoint = v.object({
  value: v.picklist(['between-frames', 'frame-in-progress', 'finished']),
  context: v.object({
    config: MatchConfig,
    completedFrames: v.pipe(
      v.array(
        v.object({
          frameIndex: v.pipe(v.number(), v.integer(), v.minValue(1)),
          breakerSeat: Seat,
          outcome: FrameOutcome,
        }),
      ),
      v.readonly(),
    ),
    framesWonBySeat: BySeatNumber,
    nextFrameIndex: v.pipe(v.number(), v.integer(), v.minValue(1)),
    activeFrame: v.nullable(
      v.object({ frameIndex: v.pipe(v.number(), v.integer(), v.minValue(1)), breakerSeat: Seat }),
    ),
    winnerSeat: v.nullable(Seat),
  }),
})

export type MatchMachineCheckpoint = v.InferOutput<typeof MatchMachineCheckpoint>

/** Complete executable aggregate state; storage cursor and Protocol are deliberately separate. */
export const MatchCheckpoint = v.object({
  lifecycle: MatchMachineCheckpoint,
  gameplay: v.nullable(GameplayCheckpoint),
  completedGameResult: v.nullable(GameResult),
})

export type MatchCheckpoint = v.InferOutput<typeof MatchCheckpoint>

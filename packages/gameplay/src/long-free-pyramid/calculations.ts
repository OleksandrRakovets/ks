import { type BySeatNumber, type Seat } from '@ks/core'
import invariant from 'tiny-invariant'

import type { LongFreePyramidContext, LongFreePyramidPhase, LongFreePyramidRack } from './definitions'

type BySeatNumber = typeof BySeatNumber.Type

type Seat = typeof Seat.Type

type LongFreePyramidContext = typeof LongFreePyramidContext.Type

type LongFreePyramidPhase = typeof LongFreePyramidPhase.Type

type LongFreePyramidRack = typeof LongFreePyramidRack.Type

export function zeroScore(): BySeatNumber {
  return { A: 0, B: 0 }
}

export function totalScore(racks: readonly LongFreePyramidRack[]): BySeatNumber {
  return racks.reduce(
    (sum, rack) => ({ A: sum.A + rack.scoreBySeat.A, B: sum.B + rack.scoreBySeat.B }),
    zeroScore(),
  )
}

export function currentRack(racks: readonly LongFreePyramidRack[]): LongFreePyramidRack {
  const rack = racks.at(-1)

  invariant(rack, 'Long free pyramid state must contain at least one rack')

  return rack
}

export function removedByRack(rack: LongFreePyramidRack): number {
  return rack.scoreBySeat.A + rack.scoreBySeat.B
}

export function ballsOnTableFromRacks(racks: readonly LongFreePyramidRack[]): number {
  return Math.max(0, 16 - removedByRack(currentRack(racks)))
}

function addRackScore(rack: LongFreePyramidRack, seat: Seat, pottedBallCount: number): LongFreePyramidRack {
  return { ...rack, scoreBySeat: { ...rack.scoreBySeat, [seat]: rack.scoreBySeat[seat] + pottedBallCount } }
}

export function applyPotToRacks(
  racks: readonly LongFreePyramidRack[],
  seat: Seat,
  pottedBallCount: number,
): LongFreePyramidRack[] {
  const rack = currentRack(racks)

  return [...racks.slice(0, -1), addRackScore(rack, seat, pottedBallCount)]
}

export function applyFoulToRacks(
  racks: readonly LongFreePyramidRack[],
  awardedSeat: Seat,
): LongFreePyramidRack[] {
  return applyPotToRacks(racks, awardedSeat, 1)
}

export function maybeRollRacks(args: {
  readonly racks: readonly LongFreePyramidRack[]
  readonly rackRollover: 14 | 15
  readonly phase: LongFreePyramidPhase
}): Pick<LongFreePyramidContext, 'racks' | 'messages'> {
  const { racks, rackRollover, phase } = args

  if (phase === 'awaiting-award') {
    return { racks: [...racks], messages: [] }
  }

  const rack = currentRack(racks)

  if (removedByRack(rack) < rackRollover) {
    return { racks: [...racks], messages: [] }
  }

  const nextRackNumber = rack.rackNumber + 1

  return {
    racks: [...racks, { rackNumber: nextRackNumber, scoreBySeat: zeroScore() }],
    messages: [{ code: 'rack-started', rackNumber: nextRackNumber }],
  }
}

export function targetReachedBySeat(score: BySeatNumber, target: BySeatNumber, seat: Seat): boolean {
  return score[seat] >= target[seat]
}

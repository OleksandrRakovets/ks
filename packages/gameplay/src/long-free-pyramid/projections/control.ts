import { type Seat } from '@ks/core'

import { deriveGameControlSections } from '../../constants'
import { ballsOnTableFromRacks, currentRack, removedByRack, totalScore } from '../calculations'
import type { LongFreePyramidControlProjection, LongFreePyramidControlProjectionState } from '../definitions'
import { getPhase, type LongFreePyramidSparringFrameSnapshot } from '../machine'

export function deriveLongFreePyramidControlProjection(
  snapshot: LongFreePyramidSparringFrameSnapshot,
): LongFreePyramidControlProjection {
  const phase = getPhase(snapshot)
  const ballsOnTable = ballsOnTableFromRacks(snapshot.context.racks)
  const rack = currentRack(snapshot.context.racks)
  const details: LongFreePyramidControlProjectionState = {
    phase,
    winner: snapshot.context.winner ?? undefined,
    rackHistory: snapshot.context.racks.map((entry) => ({ ...entry, scoreBySeat: { ...entry.scoreBySeat } })),
    currentRack: { ...rack, scoreBySeat: { ...rack.scoreBySeat } },
    ballsRemoved: removedByRack(rack),
    ballsOnTable,
    messages: snapshot.context.messages.map((message) => ({ ...message })),
  }
  const seats: Seat[] = ['A', 'B']
  const controls =
    phase === 'not-started'
      ? []
      : phase === 'open-play'
        ? [
            ...seats.flatMap((seat) =>
              ([1, 2, 3, 4] as const)
                .filter((pottedBallCount) => pottedBallCount <= ballsOnTable)
                .map((pottedBallCount, index) => ({
                  source: 'game' as const,
                  type: 'pot.record',
                  seat,
                  fixedInput: { pottedBallCount },
                  prominence: index === 0 ? ('primary' as const) : ('secondary' as const),
                })),
            ),
            ...seats.map((seat) => ({
              source: 'game' as const,
              type: 'foul.commit',
              seat,
              fixedInput: {},
              prominence: 'secondary' as const,
            })),
          ]
        : phase === 'winner-determined' && snapshot.context.winner
          ? [
              {
                source: 'game' as const,
                type: 'frame.award',
                seat: snapshot.context.winner,
                fixedInput: {},
                prominence: 'primary' as const,
              },
              ...(ballsOnTable >= 1
                ? [
                    {
                      source: 'game' as const,
                      type: 'pot.record',
                      seat: snapshot.context.winner,
                      fixedInput: { pottedBallCount: 1 },
                      prominence: 'secondary' as const,
                    },
                  ]
                : []),
            ]
          : phase === 'awaiting-award' && snapshot.context.winner
            ? [
                {
                  source: 'game' as const,
                  type: 'frame.award',
                  seat: snapshot.context.winner,
                  fixedInput: {},
                  prominence: 'primary' as const,
                },
              ]
            : []

  const isPotCommandAvailable = phase === 'open-play' || phase === 'winner-determined'

  return {
    gameKey: 'free-pyramid-long',
    projection: 'control',
    score: totalScore(snapshot.context.racks),
    details: {
      ...details,
      isPotCommandAvailable: isPotCommandAvailable && ballsOnTable > 0,
      controlSections: deriveGameControlSections(controls),
    },
  }
}

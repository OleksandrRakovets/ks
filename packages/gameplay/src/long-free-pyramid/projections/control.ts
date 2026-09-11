import { type Seat } from '@ks/core'

import type { GameControl, GameControlProjection } from '../../constants'
import { ballsOnTableFromRacks, currentRack, removedByRack, totalScore } from '../calculations'
import type { LongFreePyramidGamePresentation, LongFreePyramidGamePresentationState } from '../definitions'
import { getPhase, type LongFreePyramidSparringFrameSnapshot } from '../machine'

export function deriveLongFreePyramidControlProjection(
  snapshot: LongFreePyramidSparringFrameSnapshot,
): GameControlProjection<LongFreePyramidGamePresentation> {
  const phase = getPhase(snapshot)
  const ballsOnTable = ballsOnTableFromRacks(snapshot.context.racks)
  const rack = currentRack(snapshot.context.racks)

  const details: LongFreePyramidGamePresentationState = {
    phase,
    winner: snapshot.context.winner ?? undefined,
    rackHistory: snapshot.context.racks.map((entry) => ({ ...entry, scoreBySeat: { ...entry.scoreBySeat } })),
    currentRack: { ...rack, scoreBySeat: { ...rack.scoreBySeat } },
    ballsRemoved: removedByRack(rack),
    ballsOnTable,
    messages: snapshot.context.messages.map((message) => ({ ...message })),
  }

  const seats: readonly Seat[] = ['A', 'B']

  const controls =
    phase === 'not-started'
      ? []
      : phase === 'open-play'
        ? [
            ...seats.flatMap((seat) =>
              ([1, 2, 3, 4] as const).reduce<GameControl[]>((controls, pottedBallCount) => {
                if (pottedBallCount > ballsOnTable) return controls

                controls.push({
                  source: 'game',
                  type: 'pot.record',
                  seat,
                  fixedInput: { pottedBallCount },
                  prominence: controls.length === 0 ? 'primary' : 'secondary',
                })

                return controls
              }, []),
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
    game: {
      gameKey: 'free-pyramid-long',
      score: totalScore(snapshot.context.racks),
      details: {
        ...details,
        isPotCommandAvailable: isPotCommandAvailable && ballsOnTable > 0,
      },
    },
    controls,
  }
}

import { type Seat } from '@ks/core'

import { deriveGameCommandSections, type GameControlCommand } from '../../constants'
import { ballsOnTableFromRacks, currentRack, removedByRack, totalScore } from '../calculations'
import { type LongFreePyramidControlView, type LongFreePyramidProjectionDetails } from '../definitions'
import { getPhase, type LongFreePyramidSparringFrameSnapshot } from '../machine'

type LongFreePyramidControlCommandInput =
  | { type: 'pot.record'; seat: Seat; pottedBallCount: 1 | 2 | 3 | 4 }
  | { type: 'foul.commit'; seat: Seat }
  | { type: 'frame.award'; seat: Seat }

function command(input: LongFreePyramidControlCommandInput, prominence: GameControlCommand['prominence']): GameControlCommand {
  const { type: commandType, ...command } = input
  return { source: 'game', commandType, command, seat: input.seat, prominence }
}

export function deriveLongFreePyramidControlView(snapshot: LongFreePyramidSparringFrameSnapshot): LongFreePyramidControlView {
  const phase = getPhase(snapshot)
  const ballsOnTable = ballsOnTableFromRacks(snapshot.context.racks)
  const rack = currentRack(snapshot.context.racks)
  const details: LongFreePyramidProjectionDetails = {
    phase,
    winner: snapshot.context.winner ?? undefined,
    rackHistory: snapshot.context.racks.map((entry) => ({ ...entry, scoreBySeat: { ...entry.scoreBySeat } })),
    currentRack: { ...rack, scoreBySeat: { ...rack.scoreBySeat } },
    ballsRemoved: removedByRack(rack),
    ballsOnTable,
    messages: snapshot.context.messages.map((message) => ({ ...message })),
  }
  const seats: Seat[] = ['A', 'B']
  const commands =
    phase === 'not-started'
      ? []
      : phase === 'open-play'
        ? [
            ...seats.flatMap((seat) =>
              ([1, 2, 3, 4] as const)
                .filter((pottedBallCount) => pottedBallCount <= ballsOnTable)
                .map((pottedBallCount, index) =>
                  command({ type: 'pot.record', seat, pottedBallCount }, index === 0 ? 'primary' : 'secondary'),
                ),
            ),
            ...seats.map((seat) => command({ type: 'foul.commit', seat }, 'secondary')),
          ]
        : phase === 'winner-determined' && snapshot.context.winner
          ? [
              command({ type: 'frame.award', seat: snapshot.context.winner }, 'primary'),
              ...(ballsOnTable >= 1
                ? [command({ type: 'pot.record', seat: snapshot.context.winner, pottedBallCount: 1 }, 'secondary')]
                : []),
            ]
          : phase === 'awaiting-award' && snapshot.context.winner
            ? [command({ type: 'frame.award', seat: snapshot.context.winner }, 'primary')]
            : []

  const isPotCommandAvailable = phase === 'open-play' || phase === 'winner-determined'

  return {
    gameKey: 'free-pyramid-long',
    projection: 'control',
    score: totalScore(snapshot.context.racks),
    details: {
      ...details,
      isPotCommandAvailable: isPotCommandAvailable && ballsOnTable > 0,
      commandSections: deriveGameCommandSections(commands),
    },
  }
}

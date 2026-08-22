import { type BySeatNumber, type Seat } from '@ks/core'

import { deriveGameCommandSections, type GameControlCommand } from '../../constants'
import {
  type LongFreePyramidControlView,
  type LongFreePyramidFrameState,
  type LongFreePyramidProjectionDetails,
} from '../definitions'

type LongFreePyramidControlCommandInput =
  | { type: 'pot.record'; seat: Seat; points: 1 | 2 | 3 | 4 }
  | { type: 'foul.commit'; seat: Seat }
  | { type: 'frame.award'; seat: Seat }

function command(input: LongFreePyramidControlCommandInput, prominence: GameControlCommand['prominence']): GameControlCommand {
  const { type: commandType, ...command } = input
  return { source: 'game', commandType, command, seat: input.seat, prominence }
}

export function deriveLongFreePyramidControlView(args: {
  state: LongFreePyramidFrameState
  score: BySeatNumber
  details: LongFreePyramidProjectionDetails
  ballsOnTable: number
}): LongFreePyramidControlView {
  const seats: Seat[] = ['A', 'B']
  const commands =
    args.state.phase === 'not-started'
      ? []
      : args.state.phase === 'open-play'
        ? [
            ...seats.flatMap((seat) =>
              ([1, 2, 3, 4] as const)
                .filter((points) => points <= args.ballsOnTable)
                .map((points, index) => command({ type: 'pot.record', seat, points }, index === 0 ? 'primary' : 'secondary')),
            ),
            ...seats.map((seat) => command({ type: 'foul.commit', seat }, 'secondary')),
          ]
        : args.state.phase === 'winner-determined' && args.state.winner
          ? [
              command({ type: 'frame.award', seat: args.state.winner }, 'primary'),
              ...(args.ballsOnTable >= 1
                ? [command({ type: 'pot.record', seat: args.state.winner, points: 1 }, 'secondary')]
                : []),
            ]
          : args.state.phase === 'awaiting-award' && args.state.winner
            ? [command({ type: 'frame.award', seat: args.state.winner }, 'primary')]
            : []

  const isPotCommandAvailable = args.state.phase === 'open-play' || args.state.phase === 'winner-determined'

  return {
    gameKey: 'free-pyramid-long',
    projection: 'control',
    score: args.score,
    details: {
      ...args.details,
      isPotCommandAvailable: isPotCommandAvailable && args.ballsOnTable > 0,
      commandSections: deriveGameCommandSections(commands),
    },
  }
}

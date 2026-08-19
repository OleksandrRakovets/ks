import { type BySeatNumber, type Seat } from '@ks/core'
import * as v from 'valibot'

import { deriveGameCommandSections, type GameControlCommand } from '../../constants'
import {
  LongFreePyramidControlViewSchema,
  type LongFreePyramidFrameState,
  type LongFreePyramidProjectionDetails,
} from '../definitions'

function command(
  commandType: string,
  payload: Record<string, unknown>,
  prominence: GameControlCommand['prominence'],
): GameControlCommand {
  const seat = payload.seat === 'A' || payload.seat === 'B' ? payload.seat : undefined
  return { source: 'game', commandType, command: payload, seat, prominence }
}

export function deriveLongFreePyramidControlView(args: {
  state: LongFreePyramidFrameState
  score: BySeatNumber
  details: LongFreePyramidProjectionDetails
  ballsOnTable: number
}) {
  const seats: Seat[] = ['A', 'B']
  const commands =
    args.state.phase === 'not-started'
      ? []
      : args.state.phase === 'open-play'
        ? [
            ...seats.flatMap((seat) =>
              [1, 2, 3, 4]
                .filter((points) => points <= args.ballsOnTable)
                .map((points, index) => command('pot.record', { seat, points }, index === 0 ? 'primary' : 'secondary')),
            ),
            ...seats.map((seat) => command('foul.commit', { seat }, 'secondary')),
          ]
        : args.state.phase === 'winner-determined' && args.state.winnerSeat
          ? [
              command('frame.award', { seat: args.state.winnerSeat }, 'primary'),
              ...(args.ballsOnTable >= 1
                ? [command('pot.record', { seat: args.state.winnerSeat, points: 1 }, 'secondary')]
                : []),
            ]
          : args.state.phase === 'awaiting-award' && args.state.winnerSeat
            ? [command('frame.award', { seat: args.state.winnerSeat }, 'primary')]
            : []

  const isPotCommandAvailable = args.state.phase === 'open-play' || args.state.phase === 'winner-determined'

  return v.parse(LongFreePyramidControlViewSchema, {
    gameKey: 'free-pyramid-long',
    projection: 'control',
    score: args.score,
    details: {
      ...args.details,
      isPotCommandAvailable: isPotCommandAvailable && args.ballsOnTable > 0,
      commandSections: deriveGameCommandSections(commands),
    },
  })
}

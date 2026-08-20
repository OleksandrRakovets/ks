import { emptyControlCommandSections } from '@ks/core'
import invariant from 'tiny-invariant'

import { deriveGameCommandSections, type GameControlCommand } from '../../constants'
import type {
  AnyPyramidControlView,
  PyramidControlViewFor,
  PyramidFrameState,
  PyramidGameKey,
  PyramidRuntimeConfig,
} from '../definitions'

type PyramidControlCommandInput =
  | { type: 'pot.record'; seat: 'A' | 'B'; points: number }
  | { type: 'foul.commit'; seat: 'A' | 'B' }
  | { type: 'frame.award'; seat: 'A' | 'B' }

function command(
  input: PyramidControlCommandInput,
  extras: Omit<GameControlCommand, 'source' | 'commandType' | 'command' | 'seat'>,
): GameControlCommand {
  const { type: commandType, ...command } = input
  return { source: 'game', commandType, command, seat: input.seat, ...extras }
}

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

export function derivePyramidControlView<K extends PyramidGameKey>(
  state: PyramidFrameState,
  config: PyramidRuntimeConfig<K>,
): PyramidControlViewFor<K> {
  if (state.phase === 'not-started') {
    const projection = {
      gameKey: config.gameKey,
      projection: 'control',
      score: state.pointsBySeat,
      details: {
        ...pyramidDetails(state),
        situationTitle: 'Break-off',
        situationSummary: 'Waiting for the match to open the frame.',
        isPotCommandAvailable: false,
        commandSections: emptyControlCommandSections(),
      },
    } satisfies AnyPyramidControlView & { gameKey: K }
    return projection
  }

  if (state.phase === 'open-play') {
    const seats: Array<'A' | 'B'> = ['A', 'B']
    const commands = [
      ...seats.flatMap((seat) =>
        config.shotPointOptions.map((points, index) =>
          command({ type: 'pot.record', seat, points }, { prominence: index === 0 ? 'primary' : 'secondary' }),
        ),
      ),
      ...seats.map((seat) =>
        command(
          { type: 'foul.commit', seat },
          {
            prominence: 'secondary',
            effect: config.foulPenalty,
          },
        ),
      ),
    ]

    const projection = {
      gameKey: config.gameKey,
      projection: 'control',
      score: state.pointsBySeat,
      details: {
        ...pyramidDetails(state),
        situationTitle: 'Open play',
        situationSummary: 'Record shot value or foul for either player.',
        isPotCommandAvailable: true,
        commandSections: deriveGameCommandSections(commands),
      },
    } satisfies AnyPyramidControlView & { gameKey: K }
    return projection
  }

  if (state.phase === 'winner-determined') {
    invariant(state.winnerSeat, 'Winner is required before awarding a determined pyramid frame')
    const commands = [
      command({ type: 'frame.award', seat: state.winnerSeat }, { prominence: 'primary' }),
      command({ type: 'pot.record', seat: state.winnerSeat, points: 1 }, { prominence: 'secondary' }),
    ]

    const projection = {
      gameKey: config.gameKey,
      projection: 'control',
      score: state.pointsBySeat,
      details: {
        ...pyramidDetails(state),
        situationTitle: 'Winner determined',
        situationSummary: 'The winner may continue scoring, or the frame can be awarded now.',
        isPotCommandAvailable: true,
        commandSections: deriveGameCommandSections(commands),
      },
    } satisfies AnyPyramidControlView & { gameKey: K }
    return projection
  }

  const projection = {
    gameKey: config.gameKey,
    projection: 'control',
    score: state.pointsBySeat,
    details: {
      ...pyramidDetails(state),
      situationTitle: 'Frame over',
      situationSummary: 'No further scoring commands are available.',
      isPotCommandAvailable: false,
      commandSections: emptyControlCommandSections(),
    },
  } satisfies AnyPyramidControlView & { gameKey: K }
  return projection
}

import { emptyControlCommandSections } from '@ks/core'
import invariant from 'tiny-invariant'

import { deriveGameCommandSections, type GameControlCommand } from '../../constants'
import type { AnyPyramidControlView, PyramidControlViewFor, PyramidFrameState } from '../definitions'
import type { PyramidGameKey, PyramidRulesFor } from '../rules'

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
    winner: state.winner ?? undefined,
  }
}

export function derivePyramidControlView<K extends PyramidGameKey>(
  state: PyramidFrameState,
  rules: PyramidRulesFor<K>,
): PyramidControlViewFor<K> {
  if (state.phase === 'not-started') {
    const projection = {
      gameKey: rules.gameKey,
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
        rules.shotPointOptions.map((points, index) =>
          command({ type: 'pot.record', seat, points }, { prominence: index === 0 ? 'primary' : 'secondary' }),
        ),
      ),
      ...seats.map((seat) =>
        command(
          { type: 'foul.commit', seat },
          {
            prominence: 'secondary',
            effect: rules.foulPenalty,
          },
        ),
      ),
    ]

    const projection = {
      gameKey: rules.gameKey,
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
    invariant(state.winner !== null, 'Winner is required before awarding a determined pyramid frame')
    const commands = [
      command({ type: 'frame.award', seat: state.winner }, { prominence: 'primary' }),
      command({ type: 'pot.record', seat: state.winner, points: 1 }, { prominence: 'secondary' }),
    ]

    const projection = {
      gameKey: rules.gameKey,
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
    gameKey: rules.gameKey,
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

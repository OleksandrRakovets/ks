import { emptyControlCommandSections } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { deriveGameCommandSections, type GameControlCommand } from '../../constants'
import { PyramidControlViewSchema, type PyramidFrameState, type PyramidRuntimeConfig } from '../definitions'

function command(
  commandType: string,
  payload: Record<string, unknown>,
  label: string,
  extras: Omit<GameControlCommand, 'source' | 'commandType' | 'command' | 'seat' | 'label'>,
): GameControlCommand {
  const seat = payload.seat === 'A' || payload.seat === 'B' ? payload.seat : undefined
  return { source: 'game', commandType, command: payload, seat, label, ...extras }
}

function pyramidDetails(state: PyramidFrameState) {
  return {
    phase: state.phase,
    winner: state.winnerSeat,
  }
}

export function derivePyramidControlView(state: PyramidFrameState, config: PyramidRuntimeConfig) {
  if (state.phase === 'not-started') {
    return v.parse(PyramidControlViewSchema, {
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
    })
  }

  if (state.phase === 'open-play') {
    const seats: Array<'A' | 'B'> = ['A', 'B']
    const commands = [
      ...seats.flatMap((seat) =>
        config.shotPointOptions.map((points, index) =>
          command('pot.record', { seat, points }, `+${points}`, { prominence: index === 0 ? 'primary' : 'secondary' }),
        ),
      ),
      ...seats.map((seat) =>
        command('foul.commit', { seat }, 'Фол', {
          prominence: 'secondary',
          effectSummary:
            config.foulPenalty === 'opponent-plus-one' ? 'Opponent +1 point' : 'Offender -1 point (negative allowed)',
        }),
      ),
    ]

    return v.parse(PyramidControlViewSchema, {
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
    })
  }

  if (state.phase === 'winner-determined') {
    invariant(state.winnerSeat, 'Winner is required before awarding a determined pyramid frame')
    const commands = [
      command('frame.award', { seat: state.winnerSeat }, 'Award frame', { prominence: 'primary' }),
      command('pot.record', { seat: state.winnerSeat, points: 1 }, '+1', { prominence: 'secondary' }),
    ]

    return v.parse(PyramidControlViewSchema, {
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
    })
  }

  return v.parse(PyramidControlViewSchema, {
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
  })
}

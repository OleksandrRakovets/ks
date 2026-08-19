import { emptyControlCommandSections } from '@ks/core'
import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { deriveGameCommandSections, type GameControlCommand } from '../../constants'
import { PyramidControlViewSchema, type PyramidFrameState, type PyramidRuntimeConfig } from '../definitions'

/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- SAFETY: REVIEW_POST_REFACTOR */
function command(
  commandType: string,
  payload: Record<string, unknown>,
  extras: Omit<GameControlCommand, 'source' | 'commandType' | 'command' | 'seat'>,
): GameControlCommand {
  const seat = payload.seat === 'A' || payload.seat === 'B' ? payload.seat : undefined
  return { source: 'game', commandType, command: payload, seat, ...extras }
}
/* oxlint-enable anti-slop/no-unsafe-dictionary-type */

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
          command('pot.record', { seat, points }, { prominence: index === 0 ? 'primary' : 'secondary' }),
        ),
      ),
      ...seats.map((seat) =>
        command(
          'foul.commit',
          { seat },
          {
            prominence: 'secondary',
            effect: config.foulPenalty,
          },
        ),
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
      command('frame.award', { seat: state.winnerSeat }, { prominence: 'primary' }),
      command('pot.record', { seat: state.winnerSeat, points: 1 }, { prominence: 'secondary' }),
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

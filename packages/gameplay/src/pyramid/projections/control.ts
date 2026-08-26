import { emptyControlCommandSections } from '@ks/core'
import invariant from 'tiny-invariant'

import { deriveGameCommandSections, type GameControlCommand } from '../../constants'
import type { AnyPyramidControlView, PyramidControlViewFor } from '../definitions'
import { getPhase, type PyramidSparringFrameSnapshot } from '../machine'
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

function pyramidDetails(snapshot: PyramidSparringFrameSnapshot) {
  return {
    phase: getPhase(snapshot),
    winner: snapshot.context.winner ?? undefined,
  }
}

export function derivePyramidControlView<K extends PyramidGameKey>(
  snapshot: PyramidSparringFrameSnapshot,
  rules: PyramidRulesFor<K>,
): PyramidControlViewFor<K> {
  const phase = getPhase(snapshot)
  const score = { ...snapshot.context.score }
  if (phase === 'not-started') {
    const projection = {
      gameKey: rules.gameKey,
      projection: 'control',
      score,
      details: {
        ...pyramidDetails(snapshot),
        situationTitle: 'Break-off',
        situationSummary: 'Waiting for the match to open the frame.',
        isPotCommandAvailable: false,
        commandSections: emptyControlCommandSections(),
      },
    } satisfies AnyPyramidControlView & { gameKey: K }
    return projection
  }

  if (phase === 'open-play') {
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
      score,
      details: {
        ...pyramidDetails(snapshot),
        situationTitle: 'Open play',
        situationSummary: 'Record shot value or foul for either player.',
        isPotCommandAvailable: true,
        commandSections: deriveGameCommandSections(commands),
      },
    } satisfies AnyPyramidControlView & { gameKey: K }
    return projection
  }

  if (phase === 'winner-determined') {
    invariant(snapshot.context.winner !== null, 'Winner is required before awarding a determined pyramid frame')
    const commands = [
      command({ type: 'frame.award', seat: snapshot.context.winner }, { prominence: 'primary' }),
      command({ type: 'pot.record', seat: snapshot.context.winner, points: 1 }, { prominence: 'secondary' }),
    ]

    const projection = {
      gameKey: rules.gameKey,
      projection: 'control',
      score,
      details: {
        ...pyramidDetails(snapshot),
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
    score,
    details: {
      ...pyramidDetails(snapshot),
      situationTitle: 'Frame over',
      situationSummary: 'No further scoring commands are available.',
      isPotCommandAvailable: false,
      commandSections: emptyControlCommandSections(),
    },
  } satisfies AnyPyramidControlView & { gameKey: K }
  return projection
}

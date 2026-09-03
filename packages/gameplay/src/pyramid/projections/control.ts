import { emptyControlSections } from '@ks/core'
import invariant from 'tiny-invariant'

import { deriveGameControlSections, type GameControl } from '../../constants'
import type { AnyPyramidControlProjection, PyramidControlProjectionFor } from '../definitions'
import { getPhase, type PyramidSparringFrameSnapshot } from '../machine'
import type { PyramidGameKey, PyramidRulesFor } from '../rules'

function pyramidDetails(snapshot: PyramidSparringFrameSnapshot) {
  return {
    phase: getPhase(snapshot),
    winner: snapshot.context.winner ?? undefined,
  }
}

export function derivePyramidControlProjection<K extends PyramidGameKey>(
  snapshot: PyramidSparringFrameSnapshot,
  rules: PyramidRulesFor<K>,
): PyramidControlProjectionFor<K> {
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
        controlSections: emptyControlSections(),
      },
    } satisfies AnyPyramidControlProjection & { gameKey: K }
    return projection
  }

  if (phase === 'open-play') {
    const seats: readonly ('A' | 'B')[] = ['A', 'B']
    const controls = [
      ...seats.flatMap((seat) =>
        rules.shotPointOptions.map((pottedBallCount, index) => ({
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
        effect: rules.foulPenalty,
      })),
    ] satisfies GameControl[]

    const projection = {
      gameKey: rules.gameKey,
      projection: 'control',
      score,
      details: {
        ...pyramidDetails(snapshot),
        situationTitle: 'Open play',
        situationSummary: 'Record shot value or foul for either player.',
        isPotCommandAvailable: true,
        controlSections: deriveGameControlSections(controls),
      },
    } satisfies AnyPyramidControlProjection & { gameKey: K }
    return projection
  }

  if (phase === 'winner-determined') {
    invariant(
      snapshot.context.winner !== null,
      'Winner is required before awarding a determined pyramid frame',
    )
    const controls = [
      {
        source: 'game',
        type: 'frame.award',
        seat: snapshot.context.winner,
        fixedInput: {},
        prominence: 'primary',
      },
      {
        source: 'game',
        type: 'pot.record',
        seat: snapshot.context.winner,
        fixedInput: { pottedBallCount: 1 },
        prominence: 'secondary',
      },
    ] satisfies GameControl[]

    const projection = {
      gameKey: rules.gameKey,
      projection: 'control',
      score,
      details: {
        ...pyramidDetails(snapshot),
        situationTitle: 'Winner determined',
        situationSummary: 'The winner may continue scoring, or the frame can be awarded now.',
        isPotCommandAvailable: true,
        controlSections: deriveGameControlSections(controls),
      },
    } satisfies AnyPyramidControlProjection & { gameKey: K }
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
      controlSections: emptyControlSections(),
    },
  } satisfies AnyPyramidControlProjection & { gameKey: K }
  return projection
}

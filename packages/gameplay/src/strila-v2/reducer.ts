import invariant from 'tiny-invariant'

import {
  isCommandAllowedInPhase,
  STRILA_COLORED_BALLS,
  type StrilaCommand,
  type StrilaFrameState,
  type StrilaPhase,
  type StrilaSeat,
} from './definitions'

type WinnerDeterminedPhase = Extract<StrilaFrameState['phase'], { type: 'winner-determined' }>

function validateStrilaCommandInPhase(command: StrilaCommand, phase: StrilaPhase): string | null {
  if (!isCommandAllowedInPhase(command.type, phase.type)) {
    return `Command ${command.type} is not allowed in phase ${phase.type}`
  }

  return null
}

type RecordPotCommand = Extract<StrilaCommand, { type: 'record-pot' }>

function opponentOf(seat: StrilaSeat): StrilaSeat {
  return seat === 'A' ? 'B' : 'A'
}

function pointsForPottedBalls(pottedBalls: RecordPotCommand['pottedBalls']): number {
  return pottedBalls.reduce((sum: number, ball: RecordPotCommand['pottedBalls'][number]) => sum + (ball === 0 ? 1 : 2), 0)
}

function findPottedColoredBallMissingFromTable(state: StrilaFrameState, command: RecordPotCommand): number | null {
  for (const ball of command.pottedBalls) {
    if (ball !== 0 && !state.coloredBallsOnTable.includes(ball)) {
      return ball
    }
  }

  return null
}

function awardPoints(score: StrilaFrameState['score'], actor: StrilaSeat, points: number): StrilaFrameState['score'] {
  return actor === 'A' ? { A: score.A + points, B: score.B } : { A: score.A, B: score.B + points }
}

function removePottedColoredBalls(
  coloredBallsOnTable: StrilaFrameState['coloredBallsOnTable'],
  pottedBalls: RecordPotCommand['pottedBalls'],
): StrilaFrameState['coloredBallsOnTable'] {
  const pottedColored = new Set(
    pottedBalls.filter(
      (ball: RecordPotCommand['pottedBalls'][number]): ball is StrilaFrameState['coloredBallsOnTable'][number] => ball !== 0,
    ),
  )
  return coloredBallsOnTable.filter((ball) => !pottedColored.has(ball))
}

function nextCueBallPotStreak(prev: 0 | 1 | 2, pottedBalls: RecordPotCommand['pottedBalls']): 0 | 1 | 2 {
  if (!pottedBalls.includes(0)) return 0
  return prev >= 2 ? 2 : ((prev + 1) as 0 | 1 | 2)
}

function isIllegalOpponentFoulBallInHandPot(command: RecordPotCommand, state: StrilaFrameState): boolean {
  if (state.phase.type !== 'opponent-foul-ball-in-hand') return false

  const cueBallPotted = command.pottedBalls.includes(0)
  const coloredBallsPotted = command.pottedBalls.some((ball) => ball !== 0)
  return cueBallPotted && coloredBallsPotted
}

function isValidRespottedBlackOpeningPot(command: RecordPotCommand): boolean {
  return command.pottedBalls.length === 1 && command.pottedBalls[0] === 7
}

function makeFoulResponse(state: StrilaFrameState, actor: StrilaSeat): StrilaFrameState {
  return {
    ...state,
    phase: {
      type: 'foul-response',
      chooser: opponentOf(actor),
      offender: actor,
      forcedBallInHand: false,
    },
  }
}

function makeWinnerDetermined(
  winner: StrilaSeat,
  actor: StrilaSeat,
  reason: WinnerDeterminedPhase['reason'],
): WinnerDeterminedPhase {
  return {
    type: 'winner-determined',
    winner,
    actor,
    reason,
  }
}

function resolveNonRespottedFrameOutcome(state: StrilaFrameState): StrilaFrameState | null {
  if (state.score.A >= 9) {
    const actor = state.phase.type === 'open-play' || state.phase.type === 'winner-determined' ? state.phase.actor : 'A'
    return { ...state, phase: makeWinnerDetermined('A', actor, 'target-reached') }
  }
  if (state.score.B >= 9) {
    const actor = state.phase.type === 'open-play' || state.phase.type === 'winner-determined' ? state.phase.actor : 'B'
    return { ...state, phase: makeWinnerDetermined('B', actor, 'target-reached') }
  }

  if (state.coloredBallsOnTable.length === 0) {
    if (state.score.A === 8 && state.score.B === 8) {
      return {
        ...state,
        coloredBallsOnTable: [7],
        phase: {
          type: 'respotted-black-opening',
          actor: state.phase.type === 'open-play' || state.phase.type === 'winner-determined' ? state.phase.actor : 'A',
        },
      }
    }
  }

  return null
}

export function createEmptyStrilaFrameState(): StrilaFrameState {
  return {
    phase: { type: 'not-started' },
    score: { A: 0, B: 0 },
    coloredBallsOnTable: [...STRILA_COLORED_BALLS],
  }
}

export function reduceStrilaCommand(state: StrilaFrameState, command: StrilaCommand): StrilaFrameState {
  const validationError = validateStrilaCommandInPhase(command, state.phase)
  if (validationError) {
    throw new Error(validationError)
  }

  if (command.type === 'record-pot') {
    const missingBall = findPottedColoredBallMissingFromTable(state, command)
    invariant(missingBall === null, `Potted ball ${missingBall} is not on the table`)
  }

  switch (command.type) {
    case 'break-off': {
      invariant(state.phase.type === 'not-started', 'Frame can only be started from not-started phase')
      return {
        phase: {
          type: 'open-play',
          actor: command.actor,
          cueBallPotsInRun: 0,
        },
        score: { A: 0, B: 0 },
        coloredBallsOnTable: [...STRILA_COLORED_BALLS],
      }
    }

    case 'record-pot': {
      if (state.phase.type === 'respotted-black-opening') {
        /* One nuance: the reducer currently seeds respotted-black-opening.actor from the current shooter when the 8:8 state is reached. That closes the “actor-less phase” gap, but it is still not a true representation of the rulebook draw/lot. If you want exact rules later, the next step would be to introduce an explicit command for assigning the respotted-black opener. */
        if (!isValidRespottedBlackOpeningPot(command)) {
          return {
            ...state,
            coloredBallsOnTable: [7],
            phase: makeWinnerDetermined(opponentOf(command.actor), opponentOf(command.actor), 'automatic-foul'),
          }
        }

        return {
          ...state,
          coloredBallsOnTable: [],
          score: awardPoints(state.score, command.actor, 2),
          phase: makeWinnerDetermined(command.actor, command.actor, 'respotted-black-won'),
        }
      }

      if (state.phase.type === 'respotted-black-play') {
        return {
          ...state,
          coloredBallsOnTable: [],
          score: awardPoints(state.score, command.actor, pointsForPottedBalls(command.pottedBalls)),
          phase: makeWinnerDetermined(command.actor, command.actor, 'respotted-black-won'),
        }
      }

      if (isIllegalOpponentFoulBallInHandPot(command, state)) {
        // Incorrectly pocketed colored balls are respotted, so the table state
        // stays unchanged for this first-pass reducer.
        return makeFoulResponse(state, command.actor)
      }

      if (state.phase.type === 'open-play' && state.phase.cueBallPotsInRun === 2 && command.pottedBalls.includes(0)) {
        // Third consecutive cue-ball pot is an automatic foul. Incorrectly
        // pocketed colored balls are treated as respotted here by preserving
        // the current table state.
        return makeFoulResponse(state, command.actor)
      }

      const nextScore = awardPoints(state.score, command.actor, pointsForPottedBalls(command.pottedBalls))
      const nextColoredBallsOnTable = removePottedColoredBalls(state.coloredBallsOnTable, command.pottedBalls)

      const nextState: StrilaFrameState =
        state.phase.type === 'winner-determined'
          ? {
              ...state,
              score: nextScore,
              coloredBallsOnTable: nextColoredBallsOnTable,
              phase: {
                ...state.phase,
                actor: command.actor,
              },
            }
          : {
              ...state,
              score: nextScore,
              coloredBallsOnTable: nextColoredBallsOnTable,
              phase: {
                type: 'open-play',
                actor: command.actor,
                cueBallPotsInRun:
                  state.phase.type === 'open-play'
                    ? nextCueBallPotStreak(state.phase.cueBallPotsInRun, command.pottedBalls)
                    : command.pottedBalls.includes(0)
                      ? 1
                      : 0,
              },
            }

      return resolveNonRespottedFrameOutcome(nextState) ?? nextState
    }

    case 'record-miss': {
      switch (state.phase.type) {
        case 'open-play':
        case 'opponent-foul-ball-in-hand':
          return {
            ...state,
            phase: {
              type: 'open-play',
              actor: opponentOf(command.actor),
              cueBallPotsInRun: 0,
            },
          }

        case 'respotted-black-opening':
          return {
            ...state,
            phase: {
              type: 'respotted-black-play',
              actor: opponentOf(state.phase.actor),
            },
          }

        case 'respotted-black-play':
          return {
            ...state,
            phase: {
              type: 'respotted-black-play',
              actor: opponentOf(command.actor),
            },
          }
      }

      invariant(false, `Unsupported phase for record-miss: ${state.phase.type}`)
    }

    case 'foul-committed': {
      if (state.phase.type === 'respotted-black-opening' || state.phase.type === 'respotted-black-play') {
        return {
          ...state,
          phase: {
            ...makeWinnerDetermined(opponentOf(command.actor), opponentOf(command.actor), 'automatic-foul'),
          },
        }
      }

      return makeFoulResponse(state, command.actor)
    }

    case 'choose-foul-response': {
      invariant(state.phase.type === 'foul-response', 'Foul response can only be chosen in foul-response phase')
      invariant(command.actor === state.phase.chooser, 'Only chooser may respond to the foul')

      if (command.choice === 'ball-in-hand') {
        return {
          ...state,
          phase: {
            type: 'opponent-foul-ball-in-hand',
            actor: command.actor,
          },
        }
      }

      const awardedScore = awardPoints(state.score, command.actor, 1)
      return {
        ...state,
        score: awardedScore,
        phase: {
          type: 'open-play',
          actor: command.choice === 'play-from-position' ? command.actor : state.phase.offender,
          cueBallPotsInRun: 0,
        },
      }
    }

    case 'award-frame': {
      invariant(state.phase.type === 'winner-determined', 'award-frame is only supported in winner-determined phase')
      return {
        ...state,
        phase: {
          type: 'frame-over',
          winner: state.phase.winner,
        },
      }
    }

    case 'concede-frame': {
      if (state.phase.type !== 'frame-over') {
        return {
          ...state,
          phase: makeWinnerDetermined(
            state.phase.type === 'foul-response'
              ? state.phase.offender === command.actor
                ? state.phase.chooser
                : state.phase.offender
              : opponentOf(command.actor),
            state.phase.type === 'foul-response'
              ? state.phase.offender === command.actor
                ? state.phase.chooser
                : state.phase.offender
              : opponentOf(command.actor),
            'conceded',
          ),
        }
      }

      return {
        ...state,
        phase: {
          type: 'frame-over',
          winner: state.phase.winner,
        },
      }
    }
  }
}

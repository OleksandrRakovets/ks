import {
  STRILA_COLORED_BALLS,
  StrilaControlViewSchema,
  type StrilaColoredBall,
  type StrilaControlCommand,
  type StrilaCommand,
  type StrilaControlView,
  type StrilaFrameState,
} from '../definitions'
import { computeStrilaObjectBalls } from './computeds'

function deriveActiveBallsView(coloredBallsOnTable: StrilaColoredBall[]) {
  const active = computeStrilaObjectBalls(coloredBallsOnTable)
  const inactive = STRILA_COLORED_BALLS.filter((ball) => coloredBallsOnTable.includes(ball) && !active.includes(ball))
  return { active, inactive }
}

function command(
  commandType: StrilaCommand['type'],
  payload: Record<string, unknown>,
  label: string,
  extras: Omit<StrilaControlCommand, 'commandType' | 'command' | 'label'> = {},
): StrilaControlCommand {
  return { commandType, command: payload, label, ...extras }
}

export function deriveStrilaControlView(state: StrilaFrameState): StrilaControlView {
  const activeBalls = deriveActiveBallsView(state.coloredBallsOnTable)

  switch (state.phase.type) {
    case 'not-started':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('break-off', { actor: 'A' }, 'Break-off (A)'),
          command('break-off', { actor: 'B' }, 'Break-off (B)'),
        ],
        details: {
          phase: state.phase.type,
          situationTitle: 'Break-off',
          situationSummary: 'Record the opening break-off shot.',
          activeBalls,
        },
      })

    case 'open-play':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('record-pot', { actor: state.phase.actor }, 'Record pot'),
          command('foul-committed', { actor: state.phase.actor }, 'Foul committed'),
          command('concede-frame', { actor: state.phase.actor }, 'Concede frame'),
        ],
        details: {
          phase: state.phase.type,
          actor: state.phase.actor,
          situationTitle: 'Open play',
          situationSummary: 'Log pots or a foul for the active player.',
          activeBalls,
        },
      })

    case 'foul-response':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('choose-foul-response', { actor: state.phase.chooser, choice: 'play-from-position' }, 'Play from position', {
            effectSummary: '+1 point',
          }),
          command('choose-foul-response', { actor: state.phase.chooser, choice: 'pass-position' }, 'Pass position', {
            effectSummary: '+1 point',
          }),
          command('choose-foul-response', { actor: state.phase.chooser, choice: 'ball-in-hand' }, 'Ball in hand'),
          command('concede-frame', { actor: state.phase.chooser }, 'Concede frame'),
        ],
        details: {
          phase: state.phase.type,
          actor: state.phase.chooser,
          situationTitle: 'Choose foul response',
          situationSummary: 'Opponent committed a foul. Choose the response.',
          activeBalls,
        },
      })

    case 'opponent-foul-ball-in-hand':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('record-pot', { actor: state.phase.actor }, 'Record pot', {
            warning: 'Cue ball and colored balls together count as a foul.',
          }),
          command('record-miss', { actor: state.phase.actor }, 'Record miss'),
          command('foul-committed', { actor: state.phase.actor }, 'Foul committed'),
          command('concede-frame', { actor: state.phase.actor }, 'Concede frame'),
        ],
        details: {
          phase: state.phase.type,
          actor: state.phase.actor,
          situationTitle: 'Ball in hand after foul',
          situationSummary: 'Record a legal pot, a miss, or another foul.',
          activeBalls,
        },
      })

    case 'respotted-black-opening':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('record-pot', { actor: state.phase.actor }, 'Record pot', {
            helpText: 'A black pot wins. Any other potted result is treated as a foul.',
          }),
          command('record-miss', { actor: state.phase.actor }, 'Record miss'),
          command('foul-committed', { actor: state.phase.actor }, 'Foul committed'),
          command('concede-frame', { actor: state.phase.actor }, 'Concede frame'),
        ],
        details: {
          phase: state.phase.type,
          actor: state.phase.actor,
          situationTitle: 'Respotted black opening',
          situationSummary: 'Only the black wins. Other potted outcomes lose the frame.',
          activeBalls,
        },
      })

    case 'respotted-black-play':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('record-pot', { actor: state.phase.actor }, 'Record pot'),
          command('foul-committed', { actor: state.phase.actor }, 'Foul committed'),
          command('concede-frame', { actor: state.phase.actor }, 'Concede frame'),
        ],
        details: {
          phase: state.phase.type,
          actor: state.phase.actor,
          situationTitle: 'Respotted black play',
          situationSummary: 'Record the outcome of the shot on the respotted black.',
          activeBalls,
        },
      })

    case 'winner-determined':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('record-pot', { actor: state.phase.actor }, 'Record pot'),
          command('award-frame', { actor: state.phase.actor }, 'Award frame'),
          command('concede-frame', { actor: state.phase.actor }, 'Concede frame'),
        ],
        details: {
          phase: state.phase.type,
          actor: state.phase.actor,
          situationTitle: 'Winner determined',
          situationSummary: 'The break may continue, or the frame can be awarded now.',
          activeBalls,
        },
      })

    case 'frame-over':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [],
        details: {
          phase: state.phase.type,
          situationTitle: 'Frame over',
          situationSummary: 'No further scoring commands are available.',
          activeBalls,
        },
      })
  }
}

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
  extras: Omit<StrilaControlCommand, 'commandType' | 'command' | 'label'>,
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
          command('frame.commence', { actor: 'A' }, 'Break-off (A)', { prominence: 'primary' }),
          command('frame.commence', { actor: 'B' }, 'Break-off (B)', { prominence: 'primary' }),
        ],
        details: {
          phase: state.phase.type,
          situationTitle: 'Break-off',
          situationSummary: 'Record the opening shot.',
          activeBalls,
        },
      })

    case 'open-play':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('pot.record', { actor: state.phase.actor }, 'Record pot', { prominence: 'primary' }),
          command('foul.commit', { actor: state.phase.actor }, 'Foul committed', { prominence: 'secondary' }),
          command('frame.concede', { actor: state.phase.actor }, 'Concede frame', { prominence: 'tertiary' }),
        ],
        details: {
          phase: state.phase.type,
          actor: state.phase.actor,
          situationTitle: 'Open play',
          situationSummary: 'Log pots or a foul for the active player.',
          activeBalls,
        },
      })

    case 'penalty-selection':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('penalty.select', { actor: state.phase.chooser, choice: 'play-from-position' }, 'Play from position', {
            prominence: 'secondary',
            effectSummary: '+1 point',
          }),
          command('penalty.select', { actor: state.phase.chooser, choice: 'pass-position' }, 'Pass position', {
            prominence: 'secondary',
            effectSummary: '+1 point',
          }),
          command('penalty.select', { actor: state.phase.chooser, choice: 'ball-in-hand' }, 'Ball in hand', {
            prominence: 'secondary',
            effectSummary: 'No points awarded',
          }),
        ],
        details: {
          phase: state.phase.type,
          actor: state.phase.chooser,
          situationTitle: 'Select penalty',
          situationSummary: 'Opponent committed a foul. Choose the response.',
          activeBalls,
        },
      })

    case 'ball-in-hand':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        projection: 'control',
        score: state.score,
        availableCommands: [
          command('pot.record', { actor: state.phase.actor }, 'Record pot', {
            prominence: 'primary',
            warning: 'Cue ball and colored balls together count as a foul.',
          }),
          command('miss.record', { actor: state.phase.actor }, 'Record miss', { prominence: 'primary' }),
          command('foul.commit', { actor: state.phase.actor }, 'Foul committed', { prominence: 'secondary' }),
          command('frame.concede', { actor: state.phase.actor }, 'Concede frame', { prominence: 'tertiary' }),
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
          command('pot.record', { actor: state.phase.actor }, 'Record pot', {
            prominence: 'primary',
            helpText: 'A black pot wins. Any other potted result is treated as a foul.',
          }),
          command('miss.record', { actor: state.phase.actor }, 'Record miss', { prominence: 'primary' }),
          command('foul.commit', { actor: state.phase.actor }, 'Foul committed', { prominence: 'secondary' }),
          command('frame.concede', { actor: state.phase.actor }, 'Concede frame', { prominence: 'tertiary' }),
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
          command('pot.record', { actor: state.phase.actor }, 'Record pot', { prominence: 'primary' }),
          command('foul.commit', { actor: state.phase.actor }, 'Foul committed', { prominence: 'secondary' }),
          command('frame.concede', { actor: state.phase.actor }, 'Concede frame', { prominence: 'tertiary' }),
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
          command('pot.record', { actor: state.phase.actor }, 'Record pot', { prominence: 'primary' }),
          command('frame.award', { actor: state.phase.actor }, 'Award frame', { prominence: 'primary' }),
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

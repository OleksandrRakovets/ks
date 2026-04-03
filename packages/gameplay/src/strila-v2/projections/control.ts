import {
  STRILA_COLORED_BALLS,
  StrilaControlViewSchema,
  type StrilaColoredBall,
  type StrilaControlAction,
  type StrilaControlView,
  type StrilaFrameState,
} from '../definitions'
import { computeStrilaObjectBalls } from './computeds'

function deriveActiveBallsView(coloredBallsOnTable: StrilaColoredBall[]) {
  const active = computeStrilaObjectBalls(coloredBallsOnTable)
  const inactive = STRILA_COLORED_BALLS.filter((ball) => coloredBallsOnTable.includes(ball) && !active.includes(ball))
  return { active, inactive }
}

function action(
  id: StrilaControlAction['id'],
  label: string,
  extras: Omit<StrilaControlAction, 'id' | 'label'> = {},
): StrilaControlAction {
  return { id, label, ...extras }
}

export function deriveStrilaControlView(state: StrilaFrameState): StrilaControlView {
  const activeBalls = deriveActiveBallsView(state.coloredBallsOnTable)

  switch (state.phase.type) {
    case 'not-started':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        phase: state.phase.type,
        situationTitle: 'Break-off',
        situationSummary: 'Record the opening break-off shot.',
        score: state.score,
        activeBalls,
        availableActions: [action('break-off', 'Break-off')],
      })

    case 'open-play':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        phase: state.phase.type,
        actor: state.phase.actor,
        situationTitle: 'Open play',
        situationSummary: 'Log pots or a foul for the active player.',
        score: state.score,
        activeBalls,
        availableActions: [
          action('record-pot', 'Record pot'),
          action('foul-committed', 'Foul committed'),
          action('concede-frame', 'Concede frame'),
        ],
      })

    case 'foul-response':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        phase: state.phase.type,
        actor: state.phase.chooser,
        situationTitle: 'Choose foul response',
        situationSummary: 'Opponent committed a foul. Choose the response.',
        score: state.score,
        activeBalls,
        availableActions: [
          action('choose-play-from-position', 'Play from position', { effectSummary: '+1 point' }),
          action('choose-pass-position', 'Pass position', { effectSummary: '+1 point' }),
          action('choose-ball-in-hand', 'Ball in hand'),
          action('concede-frame', 'Concede frame'),
        ],
      })

    case 'opponent-foul-ball-in-hand':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        phase: state.phase.type,
        actor: state.phase.actor,
        situationTitle: 'Ball in hand after foul',
        situationSummary: 'Record a legal pot, a miss, or another foul.',
        score: state.score,
        activeBalls,
        availableActions: [
          action('record-pot', 'Record pot', {
            warning: 'Cue ball and colored balls together count as a foul.',
          }),
          action('record-miss', 'Record miss'),
          action('foul-committed', 'Foul committed'),
          action('concede-frame', 'Concede frame'),
        ],
      })

    case 'respotted-black-opening':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        phase: state.phase.type,
        actor: state.phase.actor,
        situationTitle: 'Respotted black opening',
        situationSummary: 'Only the black wins. Other potted outcomes lose the frame.',
        score: state.score,
        activeBalls,
        availableActions: [
          action('record-pot', 'Record pot', {
            helpText: 'A black pot wins. Any other potted result is treated as a foul.',
          }),
          action('record-miss', 'Record miss'),
          action('foul-committed', 'Foul committed'),
          action('concede-frame', 'Concede frame'),
        ],
      })

    case 'respotted-black-play':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        phase: state.phase.type,
        actor: state.phase.actor,
        situationTitle: 'Respotted black play',
        situationSummary: 'Record the outcome of the shot on the respotted black.',
        score: state.score,
        activeBalls,
        availableActions: [
          action('record-pot', 'Record pot'),
          action('foul-committed', 'Foul committed'),
          action('concede-frame', 'Concede frame'),
        ],
      })

    case 'winner-determined':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        phase: state.phase.type,
        actor: state.phase.actor,
        situationTitle: 'Winner determined',
        situationSummary: 'The break may continue, or the frame can be awarded now.',
        score: state.score,
        activeBalls,
        availableActions: [
          action('record-pot', 'Record pot'),
          action('award-frame', 'Award frame'),
          action('concede-frame', 'Concede frame'),
        ],
      })

    case 'frame-over':
      return StrilaControlViewSchema.parse({
        gameKey: 'strila-v2',
        phase: state.phase.type,
        situationTitle: 'Frame over',
        situationSummary: 'No further scoring commands are available.',
        score: state.score,
        activeBalls,
        availableActions: [],
      })
  }
}

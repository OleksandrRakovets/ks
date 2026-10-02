import type { Control, HydratedMatchParticipants } from '@ks/core'
import { type StrilaBall, type StrilaGamePresentation, StrilaMeta } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

import { controlLabel } from './control-copy'

type StrilaRuleNote = (typeof StrilaGamePresentation.Type)['details']['ruleNotes'][number]

export type RuleNotePresentation = { key: string; lines: { player?: string; text: string }[] }

export type BallSetPresentation = ReturnType<typeof presentBallSet>

export function presentBallSet(
  details: (typeof StrilaGamePresentation.Type)['details'],
  selectedBalls: readonly (typeof StrilaBall.Type)[],
  t: TFunction,
) {
  return {
    hint: details.isPotCommandAvailable ? t(keys.match.control.choosePottedBall) : undefined,
    legend: details.isPotCommandAvailable ? t(keys.match.control.choosePottedBall) : details.situationTitle,
    balls: StrilaMeta.allBalls.map((ball) => {
      const status = details.ballStatuses[ball]
      const potted = status === 'potted'

      return {
        ball,
        potted,
        selected: selectedBalls.includes(ball) && !potted,
        disabled: !details.isPotCommandAvailable || potted,
        selectable: details.isPotCommandAvailable,
        object: status === 'object',
        label: t(keys.match.control.strila.ballLabel, {
          ball: t(`match.control.strila.balls.${ball}`),
          status: t(`match.control.strila.ballStatus.${status}`),
        }),
      }
    }),
  }
}

export function presentRuleNotes(
  notes: readonly StrilaRuleNote[],
  participants: typeof HydratedMatchParticipants.Type,
  t: TFunction,
): RuleNotePresentation[] {
  return notes.map((note, index) => ({
    key: `${note.severity}-${note.code}-${index}`,
    lines: ruleMessageLines(t, note, participants),
  }))
}

export function strilaControlLabel(t: TFunction, control: typeof Control.Type): string {
  if (control.type !== 'penalty.select') return controlLabel(t, control)

  const choice = control.fixedInput.choice

  if (choice === 'play-from-position')
    return t('match.control.commands.game.penalty.select.play-from-position')

  if (choice === 'pass-position') return t('match.control.commands.game.penalty.select.pass-position')

  if (choice === 'ball-in-hand') return t('match.control.commands.game.penalty.select.ball-in-hand')

  return t('match.control.commands.game.penalty.select.default')
}

function ruleMessageLines(
  t: TFunction,
  note: StrilaRuleNote,
  participants: typeof HydratedMatchParticipants.Type,
): RuleNotePresentation['lines'] {
  switch (note.code) {
    case 'cue-ball-and-colored-is-foul':
    case 'manual-foul-cue-ball-response':
    case 'respotted-black-opening-toss':
    case 'respotted-black-opening':
      return [{ text: t(`match.control.messages.${note.code}`) }]
    case 'third-consecutive-cue-ball-pot':
      return [
        {
          player: participants[note.seat].displayName,
          text: t('match.control.messages.third-consecutive-cue-ball-pot'),
        },
      ]
    case 'last-colored-ball-pot-outcomes':
      return note.outcomes.map(({ seat, result }) => ({
        player: participants[seat].displayName,
        text:
          result.type === 'winner-determined' && result.winnerSeat === seat
            ? t('match.control.messages.last-colored-ball-frame-ball', {
                ball: t(`match.control.strila.balls.${note.ball}`),
              })
            : result.type === 'respotted-black'
              ? t('match.control.messages.last-colored-ball-pot-respots-black', {
                  ball: t(`match.control.strila.outcomeBalls.nominative.${note.ball}`),
                })
              : t('match.control.messages.last-colored-ball-pot-winner', {
                  ball: t(`match.control.strila.outcomeBalls.nominative.${note.ball}`),
                }),
      }))
  }

  return []
}

import { type Control, PositiveInteger } from '@ks/core'
import type { TFunction } from 'i18next'
import * as v from 'valibot'

const PotRecordCountPayload = v.object({ pottedBallCount: PositiveInteger })

export function potRecordPottedBallCount(control: Control): number | undefined {
  const parsed = v.safeParse(PotRecordCountPayload, control.fixedInput)
  return parsed.success ? parsed.output.pottedBallCount : undefined
}

export function controlLabel(t: TFunction, control: Control): string {
  if (control.source === 'match') {
    switch (control.type) {
      case 'frame.commence':
        return t('match.control.commands.match.frame.commence')
      case 'frame.prepare':
        return t('match.control.commands.match.frame.prepare')
      case 'frame.concede':
        return t('match.control.commands.match.frame.concede')
      case 'match.end':
        return t('match.control.commands.match.match.end')
      default:
        return t('match.control.commands.unknown')
    }
  }

  switch (control.type) {
    case 'pot.record':
      return t('match.control.commands.game.pot.record')
    case 'miss.record':
      return t('match.control.commands.game.miss.record')
    case 'foul.commit':
      return t('match.control.commands.game.foul.commit')
    case 'frame.award':
      return t('match.control.commands.game.frame.award')
    case 'penalty.select':
      return t('match.control.commands.game.penalty.select.default')
    default:
      return t('match.control.commands.unknown')
  }
}

export function controlEffect(t: TFunction, control: Control): string | undefined {
  switch (control.effect) {
    case undefined:
      return undefined
    case 'opponent-plus-one':
      return t('match.control.effects.opponent-plus-one')
    case 'offender-minus-one':
      return t('match.control.effects.offender-minus-one')
    case 'plus-one-point':
      return t('match.control.effects.plus-one-point')
    case 'no-points-awarded':
      return t('match.control.effects.no-points-awarded')
  }
  return undefined
}

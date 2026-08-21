import type { ControlCommandPreset } from '@ks/core'
import type { TFunction } from 'i18next'

export function controlCommandLabel(t: TFunction, command: ControlCommandPreset): string {
  if (command.source === 'match') {
    switch (command.commandType) {
      case 'frame.commence':
        return t('match.control.commands.match.frame.commence')
      case 'frame.start':
        return t('match.control.commands.match.frame.start')
      case 'frame.concede':
        return t('match.control.commands.match.frame.concede')
      case 'match.end':
        return t('match.control.commands.match.match.end')
      default:
        return t('match.control.commands.unknown')
    }
  }

  switch (command.commandType) {
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

export function controlCommandEffect(t: TFunction, command: ControlCommandPreset): string | undefined {
  switch (command.effect) {
    case 'opponent-plus-one':
      return t('match.control.effects.opponent-plus-one')
    case 'offender-minus-one':
      return t('match.control.effects.offender-minus-one')
    case 'plus-one-point':
      return t('match.control.effects.plus-one-point')
    case 'no-points-awarded':
      return t('match.control.effects.no-points-awarded')
    default:
      return undefined
  }
}

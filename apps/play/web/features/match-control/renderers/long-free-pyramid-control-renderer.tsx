import { type Control, groupControlsIntoSections } from '@ks/core'
import type { LongFreePyramidGamePresentation } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { ActionStack, type ControlPresentation } from '../shell'
import { controlLabel, potRecordPottedBallCount } from './control-copy'
import type { MatchControlRendererProps } from './types'

type LabelledLongFreePyramidCommand =
  | { kind: 'pottedBallCount'; command: Control; pottedBallCount: number }
  | { kind: 'command'; command: Control }

export function LongFreePyramidControlRenderer(
  props: MatchControlRendererProps<LongFreePyramidGamePresentation>,
) {
  const { t } = useTranslation()

  return (
    <ActionStack
      sections={groupControlsIntoSections(props.controls)}
      renderControl={(control) => longFreePyramidControlPresentation(t, control, props.participants)}
      submitting={props.submitting}
      onSubmit={props.onSubmitCommand}
    />
  )
}

export function labelLongFreePyramidCommands(controls: readonly Control[]): LabelledLongFreePyramidCommand[] {
  return controls.map((command) => {
    if (command.type !== 'pot.record') return { kind: 'command', command }
    const pottedBallCount = potRecordPottedBallCount(command)

    return pottedBallCount === undefined
      ? { kind: 'command', command }
      : { kind: 'pottedBallCount', command, pottedBallCount }
  })
}

function longFreePyramidControlPresentation(
  t: TFunction,
  control: Control,
  participants: MatchControlRendererProps<LongFreePyramidGamePresentation>['participants'],
): ControlPresentation {
  const [labelled] = labelLongFreePyramidCommands([control])

  if (labelled.kind === 'command') {
    const label = controlLabel(t, control)

    return { label, visibleLabel: label }
  }

  const label = t('match.control.commands.game.pot.pottedBallCount', {
    pottedBallCount: labelled.pottedBallCount,
  })

  return {
    label,
    visibleLabel: label,
    accessibleLabel: control.seat
      ? t(keys.match.control.pottedBallCountLabel, {
          count: labelled.pottedBallCount,
          player: participants[control.seat].displayName,
        })
      : undefined,
  }
}

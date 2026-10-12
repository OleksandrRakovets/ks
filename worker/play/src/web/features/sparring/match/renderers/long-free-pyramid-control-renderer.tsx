import type { Control } from '@ks/core'
import type { LongFreePyramidGamePresentation } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { controlLabel, potRecordPottedBallCount } from '@/features/sparring/match/renderers/control-copy'
import type { MatchControlRendererProps } from '@/features/sparring/match/renderers/types'
import { type ControlPresentation, ControlStack } from '@/features/sparring/match/shell/control-stack'

type LabelledLongFreePyramidCommand =
  | { kind: 'pottedBallCount'; command: Control; pottedBallCount: number }
  | { kind: 'command'; command: Control }

export function LongFreePyramidControlRenderer(
  props: MatchControlRendererProps<LongFreePyramidGamePresentation>,
) {
  const { t } = useTranslation()

  return (
    <ControlStack
      sections={props.sections}
      renderControl={(control) => longFreePyramidControlPresentation(t, control, props.participants)}
      submitting={props.submitting}
      onSubmit={props.onSubmitCommand}
    />
  )
}

/** @internal Exported for command-label contract tests. */
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

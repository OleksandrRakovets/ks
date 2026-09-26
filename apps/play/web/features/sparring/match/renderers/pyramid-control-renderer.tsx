import { type Control, groupControlsIntoSections, type HydratedMatchParticipants } from '@ks/core'
import type {
  CombinedPyramidGamePresentation,
  CombinedPyramidOldGamePresentation,
  FreePyramidGamePresentation,
} from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { type ControlPresentation, ControlStack } from '@/features/sparring/match/shell/control-stack'

import { controlLabel, potRecordPottedBallCount } from './control-copy'
import type { MatchControlRendererProps } from './types'

export function FreePyramidControlRenderer(props: MatchControlRendererProps<FreePyramidGamePresentation>) {
  return <PyramidControlRenderer {...props} />
}

export function CombinedPyramidControlRenderer(
  props: MatchControlRendererProps<CombinedPyramidGamePresentation>,
) {
  return <PyramidControlRenderer {...props} />
}

export function CombinedPyramidOldControlRenderer(
  props: MatchControlRendererProps<CombinedPyramidOldGamePresentation>,
) {
  return <PyramidControlRenderer {...props} />
}

function PyramidControlRenderer<
  TPresentation extends
    | FreePyramidGamePresentation
    | CombinedPyramidGamePresentation
    | CombinedPyramidOldGamePresentation,
>(props: MatchControlRendererProps<TPresentation>) {
  const { t } = useTranslation()

  return (
    <ControlStack
      sections={groupControlsIntoSections(props.controls)}
      renderControl={(control) => pyramidControlPresentation(t, control, props.participants)}
      submitting={props.submitting}
      onSubmit={props.onSubmitCommand}
    />
  )
}

function pyramidControlPresentation(
  t: TFunction,
  control: Control,
  participants: HydratedMatchParticipants,
): ControlPresentation {
  const pottedBallCount = potRecordPottedBallCount(control)

  const label =
    pottedBallCount === undefined
      ? controlLabel(t, control)
      : t('match.control.commands.game.pot.pottedBallCount', { pottedBallCount })

  return {
    label,
    visibleLabel: label,
    accessibleLabel:
      pottedBallCount !== undefined && control.seat
        ? t(keys.match.control.pottedBallCountLabel, {
            count: pottedBallCount,
            player: participants[control.seat].displayName,
          })
        : undefined,
  }
}

import type { Control, ControlSections, MatchCommand } from '@ks/core'
import type {
  CombinedPyramidControlProjection,
  CombinedPyramidOldControlProjection,
  FreePyramidControlProjection,
} from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'

import { controlEffect, controlLabel, potRecordPottedBallCount } from './control-copy'
import { matchCommandFromControl, type MatchControlRendererProps } from './types'

type SeatControls = ControlSections['primary']
type ControlSection = {
  controls: SeatControls
}

function pyramidCommandLabel(t: TFunction, command: Control): string {
  if (command.type !== 'pot.record') return controlLabel(t, command)
  const pottedBallCount = potRecordPottedBallCount(command)
  if (pottedBallCount === undefined) return controlLabel(t, command)
  return t('match.control.controls.game.pot.pottedBallCount', { pottedBallCount })
}

function buttonVariant(prominence: Control['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'secondary') return 'secondary'
  return 'outline'
}

function ControlRows(props: {
  controls: SeatControls
  showEffectSummaries?: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  const { t } = useTranslation()

  function renderButton(command: Control, key: string) {
    return (
      <div key={key} className="grid gap-1">
        <Button
          type="button"
          variant={buttonVariant(command.prominence)}
          size="control"
          onClick={() => props.onSubmit(matchCommandFromControl(command))}
        >
          {pyramidCommandLabel(t, command)}
        </Button>
        {props.showEffectSummaries && controlEffect(t, command) ? (
          <p className="text-center text-base text-text-lo">{controlEffect(t, command)}</p>
        ) : null}
      </div>
    )
  }

  function renderSeatControls(controls: Control[], seat: 'A' | 'B') {
    return controls.map((command, index) => renderButton(command, `${seat}-${index}`))
  }

  return (
    <section className="border-b border-divider px-4 py-3">
      <div className="grid grid-cols-2 gap-6">
        <div className="grid gap-3.5">{renderSeatControls(props.controls.A, 'A')}</div>
        <div className="grid gap-3.5">{renderSeatControls(props.controls.B, 'B')}</div>
      </div>
    </section>
  )
}

function CombinedControlRows(props: {
  sections: ControlSection[]
  onSubmit: (command: MatchCommand) => void
}) {
  const controls = props.sections.reduce<SeatControls>(
    (merged, section) => ({
      A: [...merged.A, ...section.controls.A],
      B: [...merged.B, ...section.controls.B],
    }),
    { A: [], B: [] },
  )

  return <ControlRows controls={controls} onSubmit={props.onSubmit} />
}

function NeutralControlRows(props: { controls: Control[]; onSubmit: (command: MatchCommand) => void }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-divider px-4 py-3">
      <div className="mx-auto grid w-2/3 gap-3.5">
        {props.controls.map((command, index) => (
          <Button
            key={`${command.source}-${command.type}-${index}`}
            type="button"
            variant={buttonVariant(command.prominence)}
            size="control"
            onClick={() => props.onSubmit(matchCommandFromControl(command))}
          >
            {controlLabel(t, command)}
          </Button>
        ))}
      </div>
    </section>
  )
}

function PyramidControlRenderer(props: {
  controlSections: ControlSections
  onSubmitCommand: (command: MatchCommand) => void
}) {
  const [showTertiary, setShowTertiary] = useState(false)
  const { t } = useTranslation()
  const controlSections = props.controlSections
  const hasNeutral = controlSections.neutral.length > 0

  const hasPrimary = controlSections.primary.A.length > 0 || controlSections.primary.B.length > 0
  const hasSecondary = controlSections.secondary.A.length > 0 || controlSections.secondary.B.length > 0
  const hasTertiary = controlSections.tertiary.A.length > 0 || controlSections.tertiary.B.length > 0
  const visibleSections: ControlSection[] = [
    ...(hasPrimary ? [{ controls: controlSections.primary }] : []),
    ...(hasSecondary ? [{ controls: controlSections.secondary }] : []),
  ]

  return (
    <div className="grid">
      {hasNeutral && (
        <NeutralControlRows controls={controlSections.neutral} onSubmit={props.onSubmitCommand} />
      )}

      {visibleSections.length > 0 && (
        <CombinedControlRows sections={visibleSections} onSubmit={props.onSubmitCommand} />
      )}

      {hasTertiary && (
        <div className="grid">
          <button
            type="button"
            className="px-4 py-2 text-left text-base text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? t(keys.match.control.showLess) : t(keys.match.control.showMore)}
          </button>
          {showTertiary && (
            <ControlRows controls={controlSections.tertiary} onSubmit={props.onSubmitCommand} />
          )}
        </div>
      )}
    </div>
  )
}

export function FreePyramidControlRenderer(props: MatchControlRendererProps<FreePyramidControlProjection>) {
  return (
    <PyramidControlRenderer controlSections={props.controlSections} onSubmitCommand={props.onSubmitCommand} />
  )
}

export function CombinedPyramidControlRenderer(
  props: MatchControlRendererProps<CombinedPyramidControlProjection>,
) {
  return (
    <PyramidControlRenderer controlSections={props.controlSections} onSubmitCommand={props.onSubmitCommand} />
  )
}

export function CombinedPyramidOldControlRenderer(
  props: MatchControlRendererProps<CombinedPyramidOldControlProjection>,
) {
  return (
    <PyramidControlRenderer controlSections={props.controlSections} onSubmitCommand={props.onSubmitCommand} />
  )
}

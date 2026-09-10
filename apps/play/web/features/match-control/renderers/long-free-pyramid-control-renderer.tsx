import { type Control, groupControlsIntoSections, type MatchCommand } from '@ks/core'
import type { LongFreePyramidGamePresentation } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/v2'

import { controlLabel, potRecordPottedBallCount } from './control-copy'
import { matchCommandFromControl, type MatchControlRendererProps } from './types'

type SeatControls = ReturnType<typeof groupControlsIntoSections>['primary']
type LabelledLongFreePyramidCommand =
  | { kind: 'pottedBallCount'; command: Control; pottedBallCount: number }
  | { kind: 'command'; command: Control }

export function labelLongFreePyramidCommands(controls: readonly Control[]): LabelledLongFreePyramidCommand[] {
  return controls.map((command) => {
    if (command.type !== 'pot.record') return { kind: 'command', command }
    const pottedBallCount = potRecordPottedBallCount(command)
    if (pottedBallCount === undefined) return { kind: 'command', command }
    return { kind: 'pottedBallCount', command, pottedBallCount }
  })
}

function longFreePyramidCommandLabel(t: TFunction, labelled: LabelledLongFreePyramidCommand): string {
  if (labelled.kind === 'pottedBallCount') {
    return t('match.control.commands.game.pot.pottedBallCount', {
      pottedBallCount: labelled.pottedBallCount,
    })
  }
  return controlLabel(t, labelled.command)
}

function buttonVariant(prominence: Control['prominence']): 'primary' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'primary'
  if (prominence === 'secondary') return 'secondary'
  return 'outline'
}

function ControlRows(props: { controls: SeatControls; onSubmit: (command: MatchCommand) => void }) {
  const { t } = useTranslation()

  const controls = {
    A: [...props.controls.A],
    B: [...props.controls.B],
  }

  return (
    <section className="border-b border-divider px-4 py-3">
      <div className="grid grid-cols-2 gap-6">
        {(['A', 'B'] as const).map((seat) => (
          <div key={seat} className="grid gap-3.5">
            {labelLongFreePyramidCommands(controls[seat]).map((labelled, index) => (
              <Button
                key={`${seat}-${labelled.command.type}-${index}`}
                type="button"
                variant={buttonVariant(labelled.command.prominence)}
                size="control"
                onClick={() => props.onSubmit(matchCommandFromControl(labelled.command))}
              >
                {longFreePyramidCommandLabel(t, labelled)}
              </Button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function NeutralControlRows(props: {
  controls: readonly Control[]
  onSubmit: (command: MatchCommand) => void
}) {
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

export function LongFreePyramidControlRenderer(
  props: MatchControlRendererProps<LongFreePyramidGamePresentation>,
) {
  const [showTertiary, setShowTertiary] = useState(false)
  const { t } = useTranslation()
  const controlSections = groupControlsIntoSections(props.controls)
  const hasNeutral = controlSections.neutral.length > 0
  const hasTertiary = controlSections.tertiary.A.length > 0 || controlSections.tertiary.B.length > 0
  const scoringCommands = {
    A: [...controlSections.primary.A, ...controlSections.secondary.A],
    B: [...controlSections.primary.B, ...controlSections.secondary.B],
  }
  const hasScoringCommands = scoringCommands.A.length > 0 || scoringCommands.B.length > 0

  return (
    <div className="grid">
      {hasNeutral ? (
        <NeutralControlRows controls={controlSections.neutral} onSubmit={props.onSubmitCommand} />
      ) : null}
      {hasScoringCommands ? <ControlRows controls={scoringCommands} onSubmit={props.onSubmitCommand} /> : null}
      {hasTertiary ? (
        <div className="grid">
          <button
            type="button"
            aria-expanded={showTertiary}
            className="flex items-center gap-2 px-4 py-2 text-left text-base text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            <span aria-hidden className={showTertiary ? undefined : 'rotate-180'}>
              ▲
            </span>
            {showTertiary ? t(keys.match.control.showLess) : t(keys.match.control.showMore)}
          </button>
          {showTertiary ? (
            <ControlRows controls={controlSections.tertiary} onSubmit={props.onSubmitCommand} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

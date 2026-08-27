import type { Control, MatchCommand } from '@ks/core'
import type { LongFreePyramidControlView } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'

import { controlLabel, potRecordPottedBallCount } from './control-copy'
import { matchCommandFromControl, type MatchControlRendererProps } from './types'

type SeatControls = MatchControlRendererProps<LongFreePyramidControlView>['controlSections']['primary']
type LabelledLongFreePyramidCommand =
  | { kind: 'pottedBallCount'; command: Control; pottedBallCount: number }
  | { kind: 'command'; command: Control }

export function labelLongFreePyramidCommands(controls: Control[]): LabelledLongFreePyramidCommand[] {
  return controls.map((command) => {
    if (command.type !== 'pot.record') return { kind: 'command', command }
    const pottedBallCount = potRecordPottedBallCount(command)
    if (pottedBallCount === undefined) return { kind: 'command', command }
    return { kind: 'pottedBallCount', command, pottedBallCount }
  })
}

function longFreePyramidCommandLabel(t: TFunction, labelled: LabelledLongFreePyramidCommand): string {
  if (labelled.kind === 'pottedBallCount') {
    return t('match.control.controls.game.pot.pottedBallCount', { pottedBallCount: labelled.pottedBallCount })
  }
  return controlLabel(t, labelled.command)
}

function buttonVariant(prominence: Control['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
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

export function LongFreePyramidControlRenderer(props: MatchControlRendererProps<LongFreePyramidControlView>) {
  const [showTertiary, setShowTertiary] = useState(false)
  const { t } = useTranslation()
  const controlSections = props.controlSections
  const hasNeutral = controlSections.neutral.length > 0
  const hasTertiary = controlSections.tertiary.A.length > 0 || controlSections.tertiary.B.length > 0
  const scoringCommands = {
    A: [...controlSections.primary.A, ...controlSections.secondary.A],
    B: [...controlSections.primary.B, ...controlSections.secondary.B],
  }
  const hasScoringCommands = scoringCommands.A.length > 0 || scoringCommands.B.length > 0

  const details = props.projection.details
  const previousRackScores = details.rackHistory
    .slice(0, -1)
    .map((rack) => `${rack.scoreBySeat.A}:${rack.scoreBySeat.B}`)
    .join(', ')

  return (
    <div className="grid">
      <section
        aria-label={t(keys.match.control.longFreePyramid.rackStatus)}
        className="border-b border-divider px-4 py-3"
      >
        <div className="grid gap-1 text-base">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {t(keys.match.control.longFreePyramid.rack, { rackNumber: details.currentRack.rackNumber })}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {t(keys.match.control.longFreePyramid.ballsOnTable, { count: details.ballsOnTable })}
            </span>
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">
            {t(keys.match.control.longFreePyramid.rackScore, {
              scoreA: details.currentRack.scoreBySeat.A,
              scoreB: details.currentRack.scoreBySeat.B,
            })}
          </div>
          {previousRackScores ? (
            <div className="text-sm text-muted-foreground tabular-nums">
              {t(keys.match.control.longFreePyramid.previousRacks, { scores: previousRackScores })}
            </div>
          ) : null}
          {details.messages.map((message) => (
            <p key={`${message.code}:${message.rackNumber}`} className="text-sm text-primary">
              {t(`match.control.messages.${message.code}`, { rackNumber: message.rackNumber })}
            </p>
          ))}
        </div>
      </section>

      {hasNeutral ? (
        <NeutralControlRows controls={controlSections.neutral} onSubmit={props.onSubmitCommand} />
      ) : null}
      {hasScoringCommands ? <ControlRows controls={scoringCommands} onSubmit={props.onSubmitCommand} /> : null}
      {hasTertiary ? (
        <div className="grid">
          <button
            type="button"
            className="px-4 py-2 text-left text-base text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
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

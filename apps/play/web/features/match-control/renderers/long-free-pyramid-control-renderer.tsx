import type { ControlCommandPreset } from '@ks/core'
import { LongFreePyramidControlViewSchema } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { Button } from '@ks/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as v from 'valibot'

import { controlCommandLabel } from './control-copy'
import type { MatchControlRendererProps } from './types'

type SeatCommands = MatchControlRendererProps['commandSections']['primary']

function buttonVariant(prominence: ControlCommandPreset['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'secondary') return 'secondary'
  return 'outline'
}

function CommandRows(props: { commands: SeatCommands; onSubmit: (command: ControlCommandPreset) => void }) {
  const { t } = useTranslation()

  const commands = {
    A: [...props.commands.A],
    B: [...props.commands.B],
  }

  return (
    <section className="border-b border-divider px-4 py-3">
      <div className="grid grid-cols-2 gap-6">
        {(['A', 'B'] as const).map((seat) => (
          <div key={seat} className="grid gap-3.5">
            {commands[seat].map((command, index) => (
              <Button
                key={`${seat}-${command.commandType}-${index}`}
                type="button"
                variant={buttonVariant(command.prominence)}
                size="control"
                onClick={() => props.onSubmit(command)}
              >
                {controlCommandLabel(t, command)}
              </Button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function NeutralCommandRows(props: { commands: ControlCommandPreset[]; onSubmit: (command: ControlCommandPreset) => void }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-divider px-4 py-3">
      <div className="mx-auto grid w-2/3 gap-3.5">
        {props.commands.map((command, index) => (
          <Button
            key={`${command.source}-${command.commandType}-${index}`}
            type="button"
            variant={buttonVariant(command.prominence)}
            size="control"
            onClick={() => props.onSubmit(command)}
          >
            {controlCommandLabel(t, command)}
          </Button>
        ))}
      </div>
    </section>
  )
}

export function LongFreePyramidControlRenderer(props: MatchControlRendererProps) {
  const [showTertiary, setShowTertiary] = useState(false)
  const { t } = useTranslation()
  const parsed = useMemo(() => v.safeParse(LongFreePyramidControlViewSchema, props.projection), [props.projection])
  const commandSections = props.commandSections
  const hasNeutral = commandSections.neutral.length > 0
  const hasTertiary = commandSections.tertiary.A.length > 0 || commandSections.tertiary.B.length > 0
  const scoringCommands = {
    A: [...commandSections.primary.A, ...commandSections.secondary.A],
    B: [...commandSections.primary.B, ...commandSections.secondary.B],
  }
  const hasScoringCommands = scoringCommands.A.length > 0 || scoringCommands.B.length > 0

  if (!parsed.success) {
    return (
      <div className="grid gap-4">
        {hasNeutral ? <NeutralCommandRows commands={commandSections.neutral} onSubmit={props.onSubmitCommand} /> : null}
      </div>
    )
  }

  const details = parsed.output.details
  const previousRackScores = details.rackHistory
    .slice(0, -1)
    .map((rack) => `${rack.scoreBySeat.A}:${rack.scoreBySeat.B}`)
    .join(', ')

  return (
    <div className="grid">
      <section aria-label={t(keys.match.control.longFreePyramid.rackStatus)} className="border-b border-divider px-4 py-3">
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

      {hasNeutral ? <NeutralCommandRows commands={commandSections.neutral} onSubmit={props.onSubmitCommand} /> : null}
      {hasScoringCommands ? <CommandRows commands={scoringCommands} onSubmit={props.onSubmitCommand} /> : null}
      {hasTertiary ? (
        <div className="grid">
          <button
            type="button"
            className="px-4 py-2 text-left text-base text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? t(keys.match.control.showLess) : t(keys.match.control.showMore)}
          </button>
          {showTertiary ? <CommandRows commands={commandSections.tertiary} onSubmit={props.onSubmitCommand} /> : null}
        </div>
      ) : null}
    </div>
  )
}

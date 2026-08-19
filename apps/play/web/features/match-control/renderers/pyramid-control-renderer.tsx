import type { ControlCommandPreset } from '@ks/core'
import { PyramidControlViewSchema } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as v from 'valibot'

import { Button } from '@/components/ui'

import { controlCommandEffect, controlCommandLabel } from './control-copy'
import type { MatchControlRendererProps } from './types'

type SeatCommands = MatchControlRendererProps['commandSections']['primary']
type CommandSection = {
  commands: SeatCommands
}

function buttonVariant(prominence: ControlCommandPreset['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'secondary') return 'secondary'
  return 'outline'
}

function CommandRows(props: {
  commands: SeatCommands
  showEffectSummaries?: boolean
  onSubmit: (command: ControlCommandPreset) => void
}) {
  const { t } = useTranslation()

  function renderButton(command: ControlCommandPreset, key: string) {
    return (
      <div key={key} className="grid gap-1">
        <Button
          type="button"
          variant={buttonVariant(command.prominence)}
          size="control"
          onClick={() => props.onSubmit(command)}
        >
          {controlCommandLabel(t, command)}
        </Button>
        {props.showEffectSummaries && controlCommandEffect(t, command) ? (
          <p className="text-center text-base text-text-lo">{controlCommandEffect(t, command)}</p>
        ) : null}
      </div>
    )
  }

  return (
    <section className="border-b border-divider px-4 py-3">
      <div className="grid grid-cols-2 gap-6">
        <div className="grid gap-3.5">{props.commands.A.map((command, index) => renderButton(command, `A-${index}`))}</div>
        <div className="grid gap-3.5">{props.commands.B.map((command, index) => renderButton(command, `B-${index}`))}</div>
      </div>
    </section>
  )
}

function CombinedCommandRows(props: { sections: CommandSection[]; onSubmit: (command: ControlCommandPreset) => void }) {
  const commands = props.sections.reduce<SeatCommands>(
    (merged, section) => ({
      A: [...merged.A, ...section.commands.A],
      B: [...merged.B, ...section.commands.B],
    }),
    { A: [], B: [] },
  )

  return <CommandRows commands={commands} onSubmit={props.onSubmit} />
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

export function PyramidControlRenderer(props: MatchControlRendererProps) {
  const [showTertiary, setShowTertiary] = useState(false)
  const { t } = useTranslation()
  const parsed = useMemo(() => v.safeParse(PyramidControlViewSchema, props.projection), [props.projection])
  const commandSections = props.commandSections
  const hasNeutral = commandSections.neutral.length > 0

  if (!parsed.success) {
    return (
      <div className="grid gap-4">
        {hasNeutral ? <NeutralCommandRows commands={commandSections.neutral} onSubmit={props.onSubmitCommand} /> : null}
      </div>
    )
  }

  const hasPrimary = commandSections.primary.A.length > 0 || commandSections.primary.B.length > 0
  const hasSecondary = commandSections.secondary.A.length > 0 || commandSections.secondary.B.length > 0
  const hasTertiary = commandSections.tertiary.A.length > 0 || commandSections.tertiary.B.length > 0
  const visibleSections: CommandSection[] = [
    ...(hasPrimary ? [{ commands: commandSections.primary }] : []),
    ...(hasSecondary ? [{ commands: commandSections.secondary }] : []),
  ]

  return (
    <div className="grid">
      {hasNeutral && <NeutralCommandRows commands={commandSections.neutral} onSubmit={props.onSubmitCommand} />}

      {visibleSections.length > 0 && <CombinedCommandRows sections={visibleSections} onSubmit={props.onSubmitCommand} />}

      {hasTertiary && (
        <div className="grid">
          <button
            type="button"
            className="px-4 py-2 text-left text-base text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? t(keys.match.control.showLess) : t(keys.match.control.showMore)}
          </button>
          {showTertiary && <CommandRows commands={commandSections.tertiary} onSubmit={props.onSubmitCommand} />}
        </div>
      )}
    </div>
  )
}

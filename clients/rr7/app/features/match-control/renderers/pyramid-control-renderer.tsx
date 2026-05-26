import type { ControlCommandPreset } from '@ks/core'
import { PyramidControlViewSchema } from '@ks/gameplay'
import { Button } from '@ks/ui'
import { useMemo, useState } from 'react'

import type { MatchControlRendererProps } from './types'

type SeatCommands = MatchControlRendererProps['commandSections']['primary']

function buttonVariant(prominence: ControlCommandPreset['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'secondary') return 'secondary'
  return 'outline'
}

function CommandRows(props: { title: string; commands: SeatCommands; onSubmit: (command: ControlCommandPreset) => void }) {
  function renderButton(command: ControlCommandPreset, key: string) {
    return (
      <div key={key} className="grid gap-1">
        <Button type="button" variant={buttonVariant(command.prominence)} size="touch" onClick={() => props.onSubmit(command)}>
          {command.label ?? command.commandType}
        </Button>
        {command.effectSummary ? <p className="text-center text-sm text-text-lo">{command.effectSummary}</p> : null}
      </div>
    )
  }

  return (
    <section aria-label={`${props.title} commands`} className="border-b border-divider px-4 pt-1 pb-4">
      <p className="mt-2 text-xs leading-none font-semibold tracking-widest text-text-ghost uppercase">{props.title}</p>
      <div className="mt-3 grid grid-cols-2 gap-6">
        <div className="grid gap-3">{props.commands.A.map((command, index) => renderButton(command, `A-${index}`))}</div>
        <div className="grid gap-3">{props.commands.B.map((command, index) => renderButton(command, `B-${index}`))}</div>
      </div>
    </section>
  )
}

function NeutralCommandRows(props: { commands: ControlCommandPreset[]; onSubmit: (command: ControlCommandPreset) => void }) {
  return (
    <section aria-label="Neutral commands" className="border-b border-divider px-4 pt-1 pb-4">
      <div className="mx-auto mt-3 grid w-1/2 gap-3">
        {props.commands.map((command, index) => (
          <Button
            key={`${command.source}-${command.commandType}-${index}`}
            type="button"
            variant={buttonVariant(command.prominence)}
            size="touch"
            onClick={() => props.onSubmit(command)}
          >
            {command.label ?? command.commandType}
          </Button>
        ))}
      </div>
    </section>
  )
}

export function PyramidControlRenderer(props: MatchControlRendererProps) {
  const [showTertiary, setShowTertiary] = useState(false)
  const parsed = useMemo(() => PyramidControlViewSchema.safeParse(props.projection), [props.projection])
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

  return (
    <div className="grid gap-4">
      {hasNeutral && <NeutralCommandRows commands={commandSections.neutral} onSubmit={props.onSubmitCommand} />}

      {hasPrimary && <CommandRows title="Primary" commands={commandSections.primary} onSubmit={props.onSubmitCommand} />}

      {hasSecondary && <CommandRows title="Secondary" commands={commandSections.secondary} onSubmit={props.onSubmitCommand} />}

      {hasTertiary && (
        <div className="grid gap-3">
          <button
            type="button"
            className="text-left text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? '▲ Сховати' : '··· Більше'}
          </button>
          {showTertiary && (
            <CommandRows title="Tertiary" commands={commandSections.tertiary} onSubmit={props.onSubmitCommand} />
          )}
        </div>
      )}
    </div>
  )
}

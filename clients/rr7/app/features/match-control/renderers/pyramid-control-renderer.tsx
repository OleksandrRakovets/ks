import { PyramidControlViewSchema } from '@ks/gameplay'
import { Button } from '@ks/ui'
import { useMemo, useState } from 'react'

import type { MatchControlRendererProps } from './types'

type PyramidControlView = ReturnType<typeof PyramidControlViewSchema.parse>
type Command = PyramidControlView['details']['commandSections']['primary']['A'][number]
type SeatCommands = PyramidControlView['details']['commandSections']['primary']

function buttonVariant(prominence: Command['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'secondary') return 'secondary'
  return 'outline'
}

function CommandRows(props: {
  title: string
  commands: SeatCommands
  onSubmit: (args: { commandType: string; command: Record<string, unknown> }) => void
}) {
  function renderButton(command: Command, key: string) {
    return (
      <div key={key} className="grid gap-1">
        <Button
          type="button"
          variant={buttonVariant(command.prominence)}
          size="touch"
          onClick={() => props.onSubmit({ commandType: command.commandType, command: command.command })}
        >
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

export function PyramidControlRenderer(props: MatchControlRendererProps) {
  const [showTertiary, setShowTertiary] = useState(false)
  const parsed = useMemo(() => PyramidControlViewSchema.safeParse(props.projection), [props.projection])

  if (!parsed.success) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">Invalid Pyramid control projection.</p>
  }

  const details = parsed.data.details
  const hasTertiary = details.commandSections.tertiary.A.length > 0 || details.commandSections.tertiary.B.length > 0

  return (
    <div className="grid gap-4">
      {(details.commandSections.primary.A.length > 0 || details.commandSections.primary.B.length > 0) && (
        <CommandRows title="Primary" commands={details.commandSections.primary} onSubmit={props.onSubmitCommand} />
      )}

      {(details.commandSections.secondary.A.length > 0 || details.commandSections.secondary.B.length > 0) && (
        <CommandRows title="Secondary" commands={details.commandSections.secondary} onSubmit={props.onSubmitCommand} />
      )}

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
            <CommandRows title="Tertiary" commands={details.commandSections.tertiary} onSubmit={props.onSubmitCommand} />
          )}
        </div>
      )}
    </div>
  )
}

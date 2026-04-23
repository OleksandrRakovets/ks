import { Button } from '@ks/ui'
import { useState } from 'react'

import type { MatchControlRendererProps } from './types'

export function GenericControlRenderer(props: MatchControlRendererProps) {
  const [showTertiary, setShowTertiary] = useState(false)

  const visible = props.projection.availableCommands.filter((c) => c.prominence !== 'tertiary')
  const tertiary = props.projection.availableCommands.filter((c) => c.prominence === 'tertiary')

  if (props.projection.availableCommands.length === 0) {
    return <p className="text-sm text-muted-foreground">No actions available.</p>
  }

  return (
    <div className="grid gap-3">
      {visible.map((command, index) => (
        <Button
          key={`${command.commandType}-${index}`}
          type="button"
          variant="secondary"
          className="h-auto px-4 py-2 text-sm"
          onClick={() => props.onSubmitCommand({ commandType: command.commandType, command: command.command })}
        >
          <span className="flex flex-col items-start gap-0.5">
            <span>{command.label ?? command.commandType}</span>
            {command.helpText ? <span className="text-xs opacity-70">{command.helpText}</span> : null}
            {command.effectSummary ? <span className="text-xs opacity-70">{command.effectSummary}</span> : null}
            {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
          </span>
        </Button>
      ))}

      {tertiary.length > 0 && (
        <div className="grid gap-3">
          <button
            type="button"
            className="text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? '▲ Сховати' : '··· Більше'}
          </button>
          {showTertiary &&
            tertiary.map((command, index) => (
              <Button
                key={`${command.commandType}-${index}`}
                type="button"
                variant="outline"
                className="h-auto px-4 py-2 text-sm"
                onClick={() => props.onSubmitCommand({ commandType: command.commandType, command: command.command })}
              >
                {command.label ?? command.commandType}
              </Button>
            ))}
        </div>
      )}
    </div>
  )
}

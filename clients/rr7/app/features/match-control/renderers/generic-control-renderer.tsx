import { Button } from '@ks/ui'
import { useState } from 'react'

import type { MatchControlRendererProps } from './types'

export function GenericControlRenderer(props: MatchControlRendererProps) {
  const [showSecondary, setShowSecondary] = useState(false)

  const primary = props.projection.availableCommands.filter((c) => !c.secondary)
  const secondary = props.projection.availableCommands.filter((c) => c.secondary)

  if (props.projection.availableCommands.length === 0) {
    return <p className="text-sm text-muted-foreground">No actions available.</p>
  }

  return (
    <div className="grid gap-3">
      {primary.map((command, index) => (
        <Button
          key={`${command.commandType}-${index}`}
          type="button"
          variant="secondary"
          className="h-auto px-3 py-2 text-sm"
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

      {secondary.length > 0 && (
        <div className="grid gap-3">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
            onClick={() => setShowSecondary((v) => !v)}
          >
            {showSecondary ? '▲ Сховати' : '··· Більше'}
          </button>
          {showSecondary &&
            secondary.map((command, index) => (
              <Button
                key={`${command.commandType}-${index}`}
                type="button"
                variant="outline"
                className="h-auto px-3 py-2 text-sm"
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

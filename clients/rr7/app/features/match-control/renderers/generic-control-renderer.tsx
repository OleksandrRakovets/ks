import { Button, Card, CardContent } from '@ks/ui'

import type { MatchControlRendererProps } from './types'

export function GenericControlRenderer(props: MatchControlRendererProps) {
  return (
    <Card>
      <CardContent className="grid gap-2 p-4">
        {props.projection.availableCommands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions available.</p>
        ) : (
          props.projection.availableCommands.map((command, index) => (
            <Button
              key={`${command.commandType}-${index}`}
              type="button"
              variant="secondary"
              className="h-auto justify-start px-4 py-3 text-left"
              onClick={() => props.onSubmitCommand({ commandType: command.commandType, command: command.command })}
            >
              <span className="flex flex-col items-start gap-1">
                <span>{command.label ?? command.commandType}</span>
                {command.helpText ? <span className="text-xs text-muted-foreground">{command.helpText}</span> : null}
                {command.effectSummary ? <span className="text-xs text-muted-foreground">{command.effectSummary}</span> : null}
                {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
              </span>
            </Button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

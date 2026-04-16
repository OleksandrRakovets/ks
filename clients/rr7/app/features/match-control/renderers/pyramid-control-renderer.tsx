import { Button, Card, CardContent } from '@ks/ui'

import type { MatchControlRendererProps } from './types'

function seatFromCommand(command: Record<string, unknown>): 'A' | 'B' | null {
  const actor = command.actor
  if (actor === 'A' || actor === 'B') return actor

  const seat = command.seat
  if (seat === 'A' || seat === 'B') return seat
  return null
}

export function PyramidControlRenderer(props: MatchControlRendererProps) {
  const shotCommand = props.projection.availableCommands.find((entry) => entry.commandType === 'shot.recorded')
  const otherCommands = props.projection.availableCommands.filter((entry) => entry.commandType !== 'shot.recorded')
  const seatAName = props.participants.A.shortDisplayName
  const seatBName = props.participants.B.shortDisplayName

  function submitShot(seat: 'A' | 'B', points: number) {
    const base = shotCommand?.command ?? { seat }
    props.onSubmitCommand({
      commandType: 'shot.recorded',
      command: {
        ...base,
        seat,
        points,
      },
    })
  }

  const explicitSeat = shotCommand ? seatFromCommand(shotCommand.command) : null
  const seats: ('A' | 'B')[] = explicitSeat ? [explicitSeat] : ['A', 'B']

  return (
    <div className="grid gap-3">
      {shotCommand ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {seats.map((seat) => (
            <Card key={seat}>
              <CardContent className="grid gap-3 p-4">
                <div className="text-sm text-muted-foreground">{seat === 'A' ? seatAName : seatBName}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" disabled={props.submitting} onClick={() => submitShot(seat, 1)}>
                    +1
                  </Button>
                  <Button type="button" variant="outline" disabled={props.submitting} onClick={() => submitShot(seat, -1)}>
                    -1
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {otherCommands.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {otherCommands.map((command, index) => {
            const seat = seatFromCommand(command.command)

            return (
              <Button
                key={`${command.commandType}-${index}`}
                type="button"
                variant="secondary"
                className="h-auto justify-start px-4 py-3 text-left"
                disabled={props.submitting}
                onClick={() => props.onSubmitCommand({ commandType: command.commandType, command: command.command })}
              >
                <span className="flex flex-col items-start gap-1">
                  <span>{command.label ?? command.commandType}</span>
                  {seat ? <span className="text-xs text-muted-foreground">{seat === 'A' ? seatAName : seatBName}</span> : null}
                  {command.helpText ? <span className="text-xs text-muted-foreground">{command.helpText}</span> : null}
                  {command.effectSummary ? (
                    <span className="text-xs text-muted-foreground">{command.effectSummary}</span>
                  ) : null}
                  {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
                </span>
              </Button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

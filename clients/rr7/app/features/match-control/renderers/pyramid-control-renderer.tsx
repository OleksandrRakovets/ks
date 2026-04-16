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
  const shotCommands = props.projection.availableCommands.filter((entry) => entry.commandType === 'shot.recorded')
  const foulCommand = props.projection.availableCommands.find((entry) => entry.commandType === 'foul.committed')
  const otherCommands = props.projection.availableCommands.filter(
    (entry) => entry.commandType !== 'shot.recorded' && entry.commandType !== 'foul.committed',
  )
  const seatAName = props.participants.A.shortDisplayName
  const seatBName = props.participants.B.shortDisplayName

  const pointButtons = shotCommands
    .map((command) => {
      const value = command.command.points
      if (typeof value !== 'number' || !Number.isInteger(value)) return null
      return {
        points: value,
        label: command.label ?? `+${value}`,
      }
    })
    .filter((value): value is { points: number; label: string } => value !== null)

  function submitShot(seat: 'A' | 'B', points: number) {
    const base = shotCommands[0]?.command ?? { seat }
    props.onSubmitCommand({
      commandType: 'shot.recorded',
      command: {
        ...base,
        seat,
        points,
      },
    })
  }

  function submitFoul(seat: 'A' | 'B') {
    const base = foulCommand?.command ?? { seat }
    props.onSubmitCommand({
      commandType: 'foul.committed',
      command: {
        ...base,
        seat,
      },
    })
  }

  const seatCommandTemplate = shotCommands[0]?.command ?? foulCommand?.command
  const explicitSeat = seatCommandTemplate ? seatFromCommand(seatCommandTemplate) : null
  const seats: ('A' | 'B')[] = explicitSeat ? [explicitSeat] : ['A', 'B']

  return (
    <div className="grid gap-3">
      {shotCommands.length > 0 || foulCommand ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {seats.map((seat) => (
            <Card key={seat}>
              <CardContent className="grid gap-3 p-4">
                <div className="text-sm text-muted-foreground">{seat === 'A' ? seatAName : seatBName}</div>
                <div className="grid grid-cols-2 gap-2">
                  {pointButtons.map((button) => (
                    <Button key={button.label} type="button" onClick={() => submitShot(seat, button.points)}>
                      {button.label}
                    </Button>
                  ))}
                  {foulCommand ? (
                    <Button type="button" variant="outline" onClick={() => submitFoul(seat)}>
                      Foul
                    </Button>
                  ) : null}
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

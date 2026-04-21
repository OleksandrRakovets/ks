import { Button } from '@ks/ui'
import { useState } from 'react'

import type { MatchControlRendererProps } from './types'

function seatFromCommand(command: Record<string, unknown>): 'A' | 'B' | null {
  const actor = command.actor
  if (actor === 'A' || actor === 'B') return actor

  const seat = command.seat
  if (seat === 'A' || seat === 'B') return seat
  return null
}

export function PyramidControlRenderer(props: MatchControlRendererProps) {
  const [showSecondary, setShowSecondary] = useState(false)

  const shotCommands = props.projection.availableCommands.filter((entry) => entry.commandType === 'pot.record')
  const foulCommand = props.projection.availableCommands.find((entry) => entry.commandType === 'foul.commit')
  const primaryOther = props.projection.availableCommands.filter(
    (entry) => entry.commandType !== 'pot.record' && entry.commandType !== 'foul.commit' && !entry.secondary,
  )
  const secondaryOther = props.projection.availableCommands.filter(
    (entry) => entry.commandType !== 'pot.record' && entry.commandType !== 'foul.commit' && entry.secondary,
  )
  const hasSecondary = secondaryOther.length > 0

  const pointButtons = shotCommands
    .map((command) => {
      const value = command.command.points
      if (typeof value !== 'number' || !Number.isInteger(value)) return null
      return { points: value, label: command.label ?? `+${value}` }
    })
    .filter((v): v is { points: number; label: string } => v !== null)

  const seatCommandTemplate = shotCommands[0]?.command ?? foulCommand?.command
  const explicitSeat = seatCommandTemplate ? seatFromCommand(seatCommandTemplate) : null
  const seats: ('A' | 'B')[] = explicitSeat ? [explicitSeat] : ['A', 'B']

  function submitShot(seat: 'A' | 'B', points: number) {
    const base = shotCommands[0]?.command ?? { seat }
    props.onSubmitCommand({ commandType: 'pot.record', command: { ...base, seat, points } })
  }

  function submitFoul(seat: 'A' | 'B') {
    const base = foulCommand?.command ?? { seat }
    props.onSubmitCommand({ commandType: 'foul.commit', command: { ...base, seat } })
  }

  return (
    <div className="grid gap-4">
      {(shotCommands.length > 0 || foulCommand) && (
        <div className="grid grid-cols-2 gap-6">
          {seats.map((seat) => (
            <div key={seat} className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                {pointButtons.map((button) => (
                  <Button
                    key={button.label}
                    type="button"
                    className="py-4 text-base font-medium"
                    onClick={() => submitShot(seat, button.points)}
                  >
                    {button.label}
                  </Button>
                ))}
                {foulCommand ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="py-4 text-base font-medium"
                    onClick={() => submitFoul(seat)}
                  >
                    Фол
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {primaryOther.map((command, index) => {
        const seat = seatFromCommand(command.command)
        return (
          <Button
            key={`${command.commandType}-${index}`}
            type="button"
            variant="secondary"
            className="h-auto px-3 py-2 text-sm"
            onClick={() => props.onSubmitCommand({ commandType: command.commandType, command: command.command })}
          >
            <span className="flex flex-col items-start gap-0.5">
              <span>{command.label ?? command.commandType}</span>
              {seat ? (
                <span className="text-xs opacity-70">
                  {seat === 'A' ? props.participants.A.shortDisplayName : props.participants.B.shortDisplayName}
                </span>
              ) : null}
              {command.helpText ? <span className="text-xs opacity-70">{command.helpText}</span> : null}
              {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
            </span>
          </Button>
        )
      })}

      {hasSecondary && (
        <div className="grid gap-3">
          <button
            type="button"
            className="text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowSecondary((v) => !v)}
          >
            {showSecondary ? '▲ Сховати' : '··· Більше'}
          </button>
          {showSecondary &&
            secondaryOther.map((command, index) => (
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

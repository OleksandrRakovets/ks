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
  const [showTertiary, setShowTertiary] = useState(false)

  const shotCommands = props.projection.availableCommands.filter((c) => c.commandType === 'pot.record')
  const foulCommand = props.projection.availableCommands.find((c) => c.commandType === 'foul.commit')
  const otherCommands = props.projection.availableCommands.filter(
    (c) => c.commandType !== 'pot.record' && c.commandType !== 'foul.commit',
  )
  const primaryOther = otherCommands.filter((c) => c.prominence === 'primary')
  const secondaryOther = otherCommands.filter((c) => c.prominence === 'secondary')
  const tertiaryOther = otherCommands.filter((c) => c.prominence === 'tertiary')
  const hasTertiary = tertiaryOther.length > 0

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
              {shotCommands.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${shotCommands.length}, 1fr)`, gap: '0.5rem' }}>
                  {shotCommands.map((cmd) => {
                    const points = cmd.command.points
                    if (typeof points !== 'number' || !Number.isInteger(points)) return null
                    return (
                      <Button
                        key={cmd.label ?? `+${points}`}
                        type="button"
                        variant={cmd.prominence === 'primary' ? 'default' : 'outline'}
                        size="touch"
                        onClick={() => submitShot(seat, points)}
                      >
                        {cmd.label ?? `+${points}`}
                      </Button>
                    )
                  })}
                </div>
              )}
              {foulCommand ? (
                <Button type="button" variant="outline" className="h-auto px-4 py-2 text-sm" onClick={() => submitFoul(seat)}>
                  {foulCommand.label ?? 'Фол'}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {primaryOther.map((command, index) => {
        const seat = seatFromCommand(command.command)
        const btn = (
          <Button
            key={`${command.commandType}-${index}`}
            type="button"
            size="touch"
            onClick={() => props.onSubmitCommand({ commandType: command.commandType, command: command.command })}
          >
            <span className="flex flex-col items-start gap-0.5">
              <span>{command.label ?? command.commandType}</span>
              {command.helpText ? <span className="text-xs opacity-70">{command.helpText}</span> : null}
              {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
            </span>
          </Button>
        )
        if (seat === 'A')
          return (
            <div key={`${command.commandType}-${index}`} className="grid grid-cols-2 gap-6">
              {btn}
              <div />
            </div>
          )
        if (seat === 'B')
          return (
            <div key={`${command.commandType}-${index}`} className="grid grid-cols-2 gap-6">
              <div />
              {btn}
            </div>
          )
        return btn
      })}

      {secondaryOther.map((command, index) => {
        const seat = seatFromCommand(command.command)
        const btn = (
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
              {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
            </span>
          </Button>
        )
        if (seat === 'A')
          return (
            <div key={`${command.commandType}-${index}`} className="grid grid-cols-2 gap-6">
              {btn}
              <div />
            </div>
          )
        if (seat === 'B')
          return (
            <div key={`${command.commandType}-${index}`} className="grid grid-cols-2 gap-6">
              <div />
              {btn}
            </div>
          )
        return btn
      })}

      {hasTertiary && (
        <div className="grid gap-3">
          <button
            type="button"
            className="text-left text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? '▲ Сховати' : '··· Більше'}
          </button>
          {showTertiary &&
            tertiaryOther.map((command, index) => (
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

import { Button, Card, CardContent } from '@ks/ui'
import { useMemo, useState } from 'react'

import type { MatchControlRendererProps } from './types'

const BALL_ORDER = [0, 1, 2, 3, 4, 5, 6, 7] as const

const BALL_COLORS: Record<number, string> = {
  0: '#F4F4F5',
  1: '#C62828',
  2: '#FDD835',
  3: '#2E7D32',
  4: '#6D4C41',
  5: '#1565C0',
  6: '#F8BBD0',
  7: '#111827',
}

const BALL_LABELS: Record<number, string> = {
  0: 'Cue',
  1: 'Red',
  2: 'Yellow',
  3: 'Green',
  4: 'Brown',
  5: 'Blue',
  6: 'Pink',
  7: 'Black',
}

const DUPLICATED_ACTOR_COMMANDS = new Set(['miss.record', 'foul.commit', 'frame.concede'])

function splitCommands(projection: MatchControlRendererProps['projection']) {
  const recordPot = projection.availableCommands.find((entry) => entry.commandType === 'pot.record')
  const rest = projection.availableCommands.filter((entry) => entry.commandType !== 'pot.record')
  return { recordPot, rest }
}

function strilaBallView(details: unknown): { active: number[]; allColoredOnTable: number[] } {
  if (!details || typeof details !== 'object') {
    return { active: [1, 2], allColoredOnTable: [1, 2, 3, 4, 5, 6, 7] }
  }

  const activeRaw = (details as { activeBalls?: { active?: unknown } }).activeBalls?.active
  const inactiveRaw = (details as { activeBalls?: { inactive?: unknown } }).activeBalls?.inactive

  const active = Array.isArray(activeRaw) ? activeRaw.filter((ball): ball is number => typeof ball === 'number') : []
  const inactive = Array.isArray(inactiveRaw) ? inactiveRaw.filter((ball): ball is number => typeof ball === 'number') : []

  const onTableSet = new Set<number>([...active, ...inactive])
  const allColoredOnTable = BALL_ORDER.filter((ball) => ball !== 0 && onTableSet.has(ball))

  return {
    active: active.length > 0 ? active : [1, 2],
    allColoredOnTable: allColoredOnTable.length > 0 ? allColoredOnTable : [1, 2, 3, 4, 5, 6, 7],
  }
}

function actorFromCommand(command: Record<string, unknown>): 'A' | 'B' | null {
  const actor = command.actor
  return actor === 'A' || actor === 'B' ? actor : null
}

export function StrilaControlRenderer(props: MatchControlRendererProps) {
  const { recordPot, rest } = splitCommands(props.projection)
  const [selectedBalls, setSelectedBalls] = useState<number[]>([])

  const ballView = useMemo(() => strilaBallView(props.projection.details), [props.projection.details])
  const selectableBalls = useMemo(() => [0, ...ballView.allColoredOnTable], [ballView.allColoredOnTable])
  const activeBallSet = useMemo(() => new Set(ballView.active), [ballView.active])
  const seatA = props.participants.A.shortDisplayName
  const seatB = props.participants.B.shortDisplayName
  const phase =
    props.projection.details && typeof props.projection.details === 'object'
      ? (props.projection.details as { phase?: unknown }).phase
      : undefined
  const winnerDeterminedRecordActor = phase === 'winner-determined' && recordPot ? actorFromCommand(recordPot.command) : null

  function toggleBall(ball: number) {
    setSelectedBalls((prev) => (prev.includes(ball) ? prev.filter((entry) => entry !== ball) : [...prev, ball]))
  }

  function submitSeatCommand(seat: 'A' | 'B', commandType: string, command: Record<string, unknown>) {
    setSelectedBalls([])
    props.onSubmitCommand({ commandType, command: { ...command, actor: seat } })
  }

  function submitCommand(commandType: string, command: Record<string, unknown>) {
    setSelectedBalls([])
    props.onSubmitCommand({ commandType, command })
  }

  const duplicatedCommands = rest.filter(
    (entry) => DUPLICATED_ACTOR_COMMANDS.has(entry.commandType) && actorFromCommand(entry.command) !== null,
  )
  const singleCommands = rest.filter((entry) => !duplicatedCommands.includes(entry))

  // Group singleCommands that have one variant per actor into A/B column pairs.
  type ActorPair = { A: (typeof singleCommands)[number]; B: (typeof singleCommands)[number] }
  const pairedSingleCommands: ActorPair[] = []
  const unpairedSingleCommands: (typeof singleCommands)[number][] = []
  const grouped: Record<string, { A?: (typeof singleCommands)[number]; B?: (typeof singleCommands)[number] }> = {}
  for (const cmd of singleCommands) {
    const actor = actorFromCommand(cmd.command)
    if (actor === 'A' || actor === 'B') {
      grouped[cmd.commandType] ??= {}
      grouped[cmd.commandType][actor] = cmd
    } else {
      unpairedSingleCommands.push(cmd)
    }
  }
  for (const pair of Object.values(grouped)) {
    if (pair.A && pair.B) {
      pairedSingleCommands.push({ A: pair.A, B: pair.B })
    } else {
      if (pair.A) unpairedSingleCommands.push(pair.A)
      if (pair.B) unpairedSingleCommands.push(pair.B)
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-3 p-4">
        {recordPot ? (
          <div className="grid gap-2 rounded-lg border border-border p-3">
            <div className="text-sm font-medium">{recordPot.label ?? 'Record pot'}</div>
            <div className="flex flex-wrap justify-center gap-2">
              {selectableBalls.map((ball) => {
                const selected = selectedBalls.includes(ball)
                const isObjectBall = ball !== 0 && activeBallSet.has(ball)
                return (
                  <Button
                    key={ball}
                    type="button"
                    variant={selected ? 'secondary' : 'outline'}
                    className="h-10 w-10 px-0"
                    onClick={() => toggleBall(ball)}
                    title={`${BALL_LABELS[ball] ?? ball}${isObjectBall ? ' (object)' : ''}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full border ${isObjectBall ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
                      style={{
                        backgroundColor: BALL_COLORS[ball] ?? '#D4D4D8',
                        borderColor: ball === 2 ? '#A16207' : '#27272A',
                      }}
                    />
                  </Button>
                )
              })}
            </div>
            {winnerDeterminedRecordActor ? (
              <Button
                type="button"
                disabled={selectedBalls.length === 0}
                onClick={() => submitCommand(recordPot.commandType, { ...recordPot.command, pottedBalls: selectedBalls })}
              >
                {recordPot.label ?? 'Record pot'} ({winnerDeterminedRecordActor === 'A' ? seatA : seatB})
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  disabled={selectedBalls.length === 0}
                  onClick={() =>
                    submitSeatCommand('A', recordPot.commandType, { ...recordPot.command, pottedBalls: selectedBalls })
                  }
                >
                  {recordPot.label ?? 'Record pot'} ({seatA})
                </Button>
                <Button
                  type="button"
                  disabled={selectedBalls.length === 0}
                  onClick={() =>
                    submitSeatCommand('B', recordPot.commandType, { ...recordPot.command, pottedBalls: selectedBalls })
                  }
                >
                  {recordPot.label ?? 'Record pot'} ({seatB})
                </Button>
              </div>
            )}
            {recordPot.helpText ? <p className="text-xs text-muted-foreground">{recordPot.helpText}</p> : null}
            {recordPot.warning ? <p className="text-xs text-destructive">{recordPot.warning}</p> : null}
          </div>
        ) : null}

        {duplicatedCommands.length > 0 ? (
          <div className="grid gap-2">
            {duplicatedCommands.map((command, index) => (
              <div key={`${command.commandType}-${index}`} className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-auto justify-start px-4 py-3 text-left"
                  onClick={() => submitSeatCommand('A', command.commandType, command.command)}
                >
                  <span className="flex flex-col items-start gap-1">
                    <span>{command.label ?? command.commandType}</span>
                    <span className="text-xs text-muted-foreground">{seatA}</span>
                    {command.effectSummary ? (
                      <span className="text-xs text-muted-foreground">{command.effectSummary}</span>
                    ) : null}
                    {command.helpText ? <span className="text-xs text-muted-foreground">{command.helpText}</span> : null}
                    {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-auto justify-start px-4 py-3 text-left"
                  onClick={() => submitSeatCommand('B', command.commandType, command.command)}
                >
                  <span className="flex flex-col items-start gap-1">
                    <span>{command.label ?? command.commandType}</span>
                    <span className="text-xs text-muted-foreground">{seatB}</span>
                    {command.effectSummary ? (
                      <span className="text-xs text-muted-foreground">{command.effectSummary}</span>
                    ) : null}
                    {command.helpText ? <span className="text-xs text-muted-foreground">{command.helpText}</span> : null}
                    {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
                  </span>
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {pairedSingleCommands.map((pair) => (
          <div key={pair.A.commandType} className="grid grid-cols-2 gap-2">
            {(['A', 'B'] as const).map((seat) => {
              const cmd = pair[seat]
              const label = (cmd.label ?? cmd.commandType).replace(/ \([AB]\)$/, '')
              return (
                <Button
                  key={seat}
                  type="button"
                  variant="secondary"
                  className="h-auto justify-start px-4 py-3 text-left"
                  onClick={() => submitCommand(cmd.commandType, cmd.command)}
                >
                  <span className="flex flex-col items-start gap-1">
                    <span>{label}</span>
                    <span className="text-xs text-muted-foreground">{seat === 'A' ? seatA : seatB}</span>
                    {cmd.helpText ? <span className="text-xs text-muted-foreground">{cmd.helpText}</span> : null}
                    {cmd.warning ? <span className="text-xs text-destructive">{cmd.warning}</span> : null}
                  </span>
                </Button>
              )
            })}
          </div>
        ))}

        {unpairedSingleCommands.length > 0 && (
          <div className="grid gap-2">
            {unpairedSingleCommands.map((command, index) => (
              <Button
                key={`${command.commandType}-${index}`}
                type="button"
                variant="secondary"
                className="h-auto justify-start px-4 py-3 text-left"
                onClick={() => submitCommand(command.commandType, command.command)}
              >
                <span className="flex flex-col items-start gap-1">
                  <span>{command.label ?? command.commandType}</span>
                  {command.effectSummary ? <span className="text-xs text-muted-foreground">{command.effectSummary}</span> : null}
                  {command.helpText ? <span className="text-xs text-muted-foreground">{command.helpText}</span> : null}
                  {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
                </span>
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

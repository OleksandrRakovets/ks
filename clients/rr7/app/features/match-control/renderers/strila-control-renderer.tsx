import { Button } from '@ks/ui'
import { useMemo, useState } from 'react'

import type { MatchControlRendererProps } from './types'

const BALL_ORDER = [0, 1, 2, 3, 4, 5, 6, 7] as const

const BALL_META: Record<number, { bg: string; border: string }> = {
  0: { bg: '#F0EDE6', border: '#C0BDB5' },
  1: { bg: '#C8102E', border: '#9E0E24' },
  2: { bg: '#F5C518', border: '#C9A00E' },
  3: { bg: '#00A550', border: '#008040' },
  4: { bg: '#7B4F2E', border: '#5C3A1E' },
  5: { bg: '#005EB8', border: '#004A92' },
  6: { bg: '#E8729A', border: '#C85580' },
  7: { bg: '#2a2a2a', border: '#555555' },
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
  const [showTertiary, setShowTertiary] = useState(false)

  const ballView = useMemo(() => strilaBallView(props.projection.details), [props.projection.details])
  const selectableBalls = useMemo(() => [0, ...ballView.allColoredOnTable], [ballView.allColoredOnTable])
  const activeBallSet = useMemo(() => new Set(ballView.active), [ballView.active])
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

  // Group single commands that have exactly one variant per actor (e.g. frame.commence A+B) into A/B column pairs.
  // Commands where multiple entries share the same commandType+actor (e.g. penalty.select options) bypass grouping.
  type ActorPair = { A: (typeof singleCommands)[number]; B: (typeof singleCommands)[number] }
  const pairedSingleCommands: ActorPair[] = []
  const unpairedSingleCommands: (typeof singleCommands)[number][] = []

  const commandActorCounts = new Map<string, number>()
  for (const cmd of singleCommands) {
    const actor = actorFromCommand(cmd.command)
    if (actor) {
      const key = `${cmd.commandType}:${actor}`
      commandActorCounts.set(key, (commandActorCounts.get(key) ?? 0) + 1)
    }
  }

  const grouped: Record<string, { A?: (typeof singleCommands)[number]; B?: (typeof singleCommands)[number] }> = {}
  for (const cmd of singleCommands) {
    const actor = actorFromCommand(cmd.command)
    if (actor === 'A' || actor === 'B') {
      const key = `${cmd.commandType}:${actor}`
      if ((commandActorCounts.get(key) ?? 0) > 1) {
        unpairedSingleCommands.push(cmd)
      } else {
        grouped[cmd.commandType] ??= {}
        grouped[cmd.commandType][actor] = cmd
      }
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

  const visibleDuplicated = duplicatedCommands.filter((c) => c.prominence !== 'tertiary')
  const tertiaryDuplicated = duplicatedCommands.filter((c) => c.prominence === 'tertiary')
  const visibleUnpaired = unpairedSingleCommands.filter((c) => c.prominence !== 'tertiary')
  const tertiaryUnpaired = unpairedSingleCommands.filter((c) => c.prominence === 'tertiary')
  const hasTertiary = tertiaryDuplicated.length > 0 || tertiaryUnpaired.length > 0

  return (
    <div className="grid gap-4">
      {recordPot ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {BALL_ORDER.map((ball) => {
              const meta = BALL_META[ball] ?? { bg: '#D4D4D8', border: '#27272A' }
              const isObjectBall = ball !== 0 && activeBallSet.has(ball)
              const isPotted = ball !== 0 && !ballView.allColoredOnTable.includes(ball)
              const selected = selectedBalls.includes(ball) && !isPotted
              const sz = ball === 0 || isObjectBall ? 40 : 32
              return (
                <button
                  key={ball}
                  type="button"
                  disabled={isPotted}
                  title={`${BALL_LABELS[ball] ?? ball}${isObjectBall ? ' (object)' : ''}${isPotted ? ' (potted)' : ''}`}
                  onClick={() => toggleBall(ball)}
                  style={{
                    width: sz,
                    height: sz,
                    borderRadius: '50%',
                    flexShrink: 0,
                    cursor: isPotted ? 'not-allowed' : 'pointer',
                    background: meta.bg,
                    border: selected ? '2.5px solid var(--a-amber)' : `1.5px solid ${meta.border}`,
                    boxShadow: selected
                      ? '0 0 0 3px var(--a-amber-dim), 0 2px 8px rgba(0,0,0,0.6)'
                      : isPotted
                        ? 'none'
                        : '0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
                    opacity: isPotted ? 0.3 : 1,
                    transition: 'box-shadow 0.1s, border-color 0.1s, opacity 0.2s',
                    padding: 0,
                  }}
                />
              )
            })}
          </div>
          {winnerDeterminedRecordActor ? (
            <div className="grid grid-cols-2 gap-6">
              {winnerDeterminedRecordActor === 'A' && (
                <Button
                  type="button"
                  size={recordPot.prominence === 'primary' ? 'touch' : 'default'}
                  className={recordPot.prominence !== 'primary' ? 'h-auto py-2 text-sm' : undefined}
                  disabled={selectedBalls.length === 0}
                  onClick={() => submitCommand(recordPot.commandType, { ...recordPot.command, pottedBalls: selectedBalls })}
                >
                  {recordPot.label ?? 'Record pot'}
                </Button>
              )}
              {winnerDeterminedRecordActor === 'B' && <div />}
              {winnerDeterminedRecordActor === 'B' && (
                <Button
                  type="button"
                  size={recordPot.prominence === 'primary' ? 'touch' : 'default'}
                  className={recordPot.prominence !== 'primary' ? 'h-auto py-2 text-sm' : undefined}
                  disabled={selectedBalls.length === 0}
                  onClick={() => submitCommand(recordPot.commandType, { ...recordPot.command, pottedBalls: selectedBalls })}
                >
                  {recordPot.label ?? 'Record pot'}
                </Button>
              )}
              {winnerDeterminedRecordActor === 'A' && <div />}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <Button
                type="button"
                size={recordPot.prominence === 'primary' ? 'touch' : 'default'}
                className={recordPot.prominence !== 'primary' ? 'h-auto py-2 text-sm' : undefined}
                disabled={selectedBalls.length === 0}
                onClick={() =>
                  submitSeatCommand('A', recordPot.commandType, { ...recordPot.command, pottedBalls: selectedBalls })
                }
              >
                {recordPot.label ?? 'Record pot'}
              </Button>
              <Button
                type="button"
                size={recordPot.prominence === 'primary' ? 'touch' : 'default'}
                className={recordPot.prominence !== 'primary' ? 'h-auto py-2 text-sm' : undefined}
                disabled={selectedBalls.length === 0}
                onClick={() =>
                  submitSeatCommand('B', recordPot.commandType, { ...recordPot.command, pottedBalls: selectedBalls })
                }
              >
                {recordPot.label ?? 'Record pot'}
              </Button>
            </div>
          )}
          {recordPot.helpText ? <p className="text-xs text-muted-foreground">{recordPot.helpText}</p> : null}
          {recordPot.warning ? <p className="text-xs text-destructive">{recordPot.warning}</p> : null}
        </div>
      ) : null}

      {visibleDuplicated.map((command, index) => (
        <div key={`${command.commandType}-${index}`} className="grid grid-cols-2 gap-6">
          {(['A', 'B'] as const).map((seat) => (
            <Button
              key={seat}
              type="button"
              variant="secondary"
              className="h-auto px-4 py-2 text-sm"
              onClick={() => submitSeatCommand(seat, command.commandType, command.command)}
            >
              <span className="flex flex-col items-center gap-0.5">
                <span>{command.label ?? command.commandType}</span>
                {command.effectSummary ? <span className="text-xs opacity-70">{command.effectSummary}</span> : null}
                {command.helpText ? <span className="text-xs opacity-70">{command.helpText}</span> : null}
                {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
              </span>
            </Button>
          ))}
        </div>
      ))}

      {pairedSingleCommands.map((pair) => (
        <div key={pair.A.commandType} className="grid grid-cols-2 gap-6">
          {(['A', 'B'] as const).map((seat) => {
            const cmd = pair[seat]
            const label = (cmd.label ?? cmd.commandType).replace(/ \([AB]\)$/, '')
            return (
              <Button
                key={seat}
                type="button"
                variant={cmd.prominence === 'primary' ? 'default' : 'secondary'}
                size={cmd.prominence === 'primary' ? 'touch' : 'default'}
                className={cmd.prominence !== 'primary' ? 'h-auto px-3 py-2 text-sm' : undefined}
                onClick={() => submitCommand(cmd.commandType, cmd.command)}
              >
                <span className="flex flex-col items-center gap-0.5">
                  <span>{label}</span>
                  {cmd.helpText ? <span className="text-xs opacity-70">{cmd.helpText}</span> : null}
                  {cmd.warning ? <span className="text-xs text-destructive">{cmd.warning}</span> : null}
                </span>
              </Button>
            )
          })}
        </div>
      ))}

      {visibleUnpaired.map((command, index) => {
        const actor = actorFromCommand(command.command)
        const btn = (
          <Button
            key={`${command.commandType}-${index}`}
            type="button"
            variant={command.prominence === 'primary' ? 'default' : 'secondary'}
            size={command.prominence === 'primary' ? 'touch' : 'default'}
            className={command.prominence !== 'primary' ? 'h-auto px-3 py-2 text-sm' : undefined}
            onClick={() => submitCommand(command.commandType, command.command)}
          >
            <span className="flex flex-col items-center gap-0.5">
              <span>{command.label ?? command.commandType}</span>
              {command.effectSummary ? <span className="text-xs opacity-70">{command.effectSummary}</span> : null}
              {command.helpText ? <span className="text-xs opacity-70">{command.helpText}</span> : null}
              {command.warning ? <span className="text-xs text-destructive">{command.warning}</span> : null}
            </span>
          </Button>
        )
        if (actor === 'A')
          return (
            <div key={`${command.commandType}-${index}`} className="grid grid-cols-2 gap-6">
              {btn}
              <div />
            </div>
          )
        if (actor === 'B')
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
            className="text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? '▲ Сховати' : '··· Більше'}
          </button>
          {showTertiary && (
            <>
              {tertiaryDuplicated.map((command, index) => (
                <div key={`${command.commandType}-${index}`} className="grid grid-cols-2 gap-6">
                  {(['A', 'B'] as const).map((seat) => (
                    <Button
                      key={seat}
                      type="button"
                      variant="outline"
                      className="h-auto px-3 py-2 text-sm"
                      onClick={() => submitSeatCommand(seat, command.commandType, command.command)}
                    >
                      {command.label ?? command.commandType}
                    </Button>
                  ))}
                </div>
              ))}
              {tertiaryUnpaired.map((command, index) => (
                <Button
                  key={`${command.commandType}-${index}`}
                  type="button"
                  variant="outline"
                  className="h-auto px-3 py-2 text-sm"
                  onClick={() => submitCommand(command.commandType, command.command)}
                >
                  {command.label ?? command.commandType}
                </Button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

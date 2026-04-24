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

type Command = MatchControlRendererProps['projection']['availableCommands'][number]

function prominenceVariant(prominence: string): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'tertiary') return 'outline'
  return 'secondary'
}

function sectionMessages(commands: Command[]): { text: string; className: string }[] {
  const seen = new Set<string>()
  const out: { text: string; className: string }[] = []
  for (const cmd of commands) {
    for (const [text, className] of [
      [cmd.helpText, 'text-muted-foreground'],
      [cmd.warning, 'text-destructive'],
    ] as [string | undefined, string][]) {
      if (text && !seen.has(text)) {
        out.push({ text, className })
        seen.add(text)
      }
    }
  }
  return out
}

function CommandRows({
  commands,
  selectedBalls,
  onSubmit,
}: {
  commands: Command[]
  selectedBalls: number[]
  onSubmit: (commandType: string, command: Record<string, unknown>) => void
}) {
  const aCommands = commands.filter((c) => actorFromCommand(c.command) === 'A')
  const bCommands = commands.filter((c) => actorFromCommand(c.command) === 'B')
  const rowCount = Math.max(aCommands.length, bCommands.length)
  const messages = sectionMessages(commands)

  function renderButton(cmd: Command) {
    const isPot = cmd.commandType === 'pot.record'
    const command = isPot ? { ...cmd.command, pottedBalls: selectedBalls } : cmd.command
    return (
      <div className="grid gap-1">
        <Button
          type="button"
          variant={prominenceVariant(cmd.prominence)}
          size="touch"
          disabled={isPot && selectedBalls.length === 0}
          onClick={() => onSubmit(cmd.commandType, command)}
        >
          {cmd.label ?? cmd.commandType}
        </Button>
        {cmd.effectSummary && <p className="text-center text-sm text-text-lo">{cmd.effectSummary}</p>}
      </div>
    )
  }

  return (
    <section aria-label="Visible commands" className="border-b border-divider px-4 pt-1 pb-4">
      {Array.from({ length: rowCount }, (_, i) => {
        const a = aCommands[i]
        const b = bCommands[i]
        return (
          <div key={i} className="mt-3 grid grid-cols-2 gap-6">
            {a ? renderButton(a) : <div />}
            {b ? renderButton(b) : <div />}
          </div>
        )
      })}
      {messages.map(({ text, className }) => (
        <p key={text} className={`mt-2 text-sm font-semibold ${className}`}>
          {text}
        </p>
      ))}
    </section>
  )
}

export function StrilaControlRenderer(props: MatchControlRendererProps) {
  console.log('rendering Strila controls')
  const [selectedBalls, setSelectedBalls] = useState<number[]>([])
  const [showTertiary, setShowTertiary] = useState(false)

  const ballView = useMemo(() => strilaBallView(props.projection.details), [props.projection.details])
  const activeBallSet = useMemo(() => new Set(ballView.active), [ballView.active])

  const hasPotCommand = props.projection.availableCommands.some((c) => c.commandType === 'pot.record')
  const visibleCommands = props.projection.availableCommands.filter((c) => c.prominence !== 'tertiary')
  const tertiaryCommands = props.projection.availableCommands.filter((c) => c.prominence === 'tertiary')

  function submitCommand(commandType: string, command: Record<string, unknown>) {
    setSelectedBalls([])
    props.onSubmitCommand({ commandType, command })
  }

  return (
    <div aria-label="Strila container" className="grid">
      <p className="mt-4 px-4 text-sm leading-none font-semibold tracking-widest text-text-ghost uppercase">
        Обери забиту кулю
      </p>
      <div
        aria-label="Ball grid"
        className="mx-auto grid gap-x-3 border-b border-divider px-4 py-4"
        style={{ gridTemplateColumns: 'repeat(8, 1fr)', width: 'min(100%, 468px)' }}
      >
        {BALL_ORDER.map((ball) => {
          const meta = BALL_META[ball] ?? { bg: '#D4D4D8', border: '#27272A' }
          const isObjectBall = ball !== 0 && activeBallSet.has(ball)
          const isPotted = ball !== 0 && !ballView.allColoredOnTable.includes(ball)
          const isFullSize = ball === 0 || isObjectBall
          const selected = hasPotCommand && selectedBalls.includes(ball) && !isPotted
          return (
            <div key={ball} className="flex items-center justify-center">
              <button
                type="button"
                title={`${BALL_LABELS[ball] ?? ball}${isObjectBall ? ' (object)' : ''}${isPotted ? ' (potted)' : ''}`}
                onClick={() => {
                  if (!hasPotCommand || isPotted) return
                  setSelectedBalls((prev) => (prev.includes(ball) ? prev.filter((b) => b !== ball) : [...prev, ball]))
                }}
                style={{
                  width: isFullSize ? '100%' : '80%',
                  maxWidth: isFullSize ? '48px' : '38px',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  cursor: !hasPotCommand || isPotted ? 'default' : 'pointer',
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
            </div>
          )
        })}
      </div>

      <CommandRows commands={visibleCommands} selectedBalls={selectedBalls} onSubmit={submitCommand} />

      {tertiaryCommands.length > 0 && (
        <div className="grid gap-3">
          <button
            type="button"
            className="text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? '▲ Сховати' : '··· Більше'}
          </button>
          {showTertiary && <CommandRows commands={tertiaryCommands} selectedBalls={selectedBalls} onSubmit={submitCommand} />}
        </div>
      )}
    </div>
  )
}

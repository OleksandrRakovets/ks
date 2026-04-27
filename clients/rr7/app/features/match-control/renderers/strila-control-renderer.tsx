import { StrilaMeta, StrilaControlViewSchema, type StrilaBall } from '@ks/gameplay'
import { Button } from '@ks/ui'
import { useMemo, useState } from 'react'

import type { MatchControlRendererProps } from './types'

const BALL_COLORS: Record<StrilaBall, { bg: string; border: string }> = {
  0: { bg: '#F0EDE6', border: '#C0BDB5' },
  1: { bg: '#C8102E', border: '#9E0E24' },
  2: { bg: '#F5C518', border: '#C9A00E' },
  3: { bg: '#00A550', border: '#008040' },
  4: { bg: '#7B4F2E', border: '#5C3A1E' },
  5: { bg: '#005EB8', border: '#004A92' },
  6: { bg: '#E8729A', border: '#C85580' },
  7: { bg: '#2a2a2a', border: '#555555' },
}

const BALL_LABELS: Record<StrilaBall, string> = {
  0: 'Cueball',
  1: 'Red',
  2: 'Yellow',
  3: 'Green',
  4: 'Brown',
  5: 'Blue',
  6: 'Pink',
  7: 'Black',
}

type StrilaControlView = ReturnType<typeof StrilaControlViewSchema.parse>
type Command = StrilaControlView['details']['commandSections']['primary']['A'][number]
type SeatCommands = StrilaControlView['details']['commandSections']['primary']

function prominenceVariant(prominence: Command['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'tertiary') return 'outline'
  return 'secondary'
}

function CommandRows({
  title,
  commands,
  selectedBalls,
  onSubmit,
}: {
  title: string
  commands: SeatCommands
  selectedBalls: StrilaBall[]
  onSubmit: (commandType: string, command: Record<string, unknown>) => void
}) {
  function renderButton(cmd: Command, key: string) {
    const isPot = cmd.commandType === 'pot.record'
    const command = isPot ? { ...cmd.command, pottedBalls: selectedBalls } : cmd.command
    return (
      <div key={key} className="grid gap-1">
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
      <p className="mt-2 text-xs leading-none font-semibold tracking-widest text-text-ghost uppercase">{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-6">
        <div className="grid gap-3">{commands.A.map((cmd, index) => renderButton(cmd, `A-${cmd.commandType}-${index}`))}</div>
        <div className="grid gap-3">{commands.B.map((cmd, index) => renderButton(cmd, `B-${cmd.commandType}-${index}`))}</div>
      </div>
    </section>
  )
}

export function StrilaControlRenderer(props: MatchControlRendererProps) {
  const [selectedBalls, setSelectedBalls] = useState<StrilaBall[]>([])
  const [showTertiary, setShowTertiary] = useState(false)

  const parsed = useMemo(() => StrilaControlViewSchema.safeParse(props.projection), [props.projection])

  if (!parsed.success) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">Invalid Strila control projection.</p>
  }

  const details = parsed.data.details
  const hasTertiary = details.commandSections.tertiary.A.length > 0 || details.commandSections.tertiary.B.length > 0

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
        {StrilaMeta.allBalls.map((ball) => {
          const colors = BALL_COLORS[ball]
          const status = details.ballStatuses[ball]
          const isPotted = status === 'potted'
          const isSelected = details.isPotCommandAvailable && selectedBalls.includes(ball) && !isPotted
          return (
            <div key={ball} className="flex items-center justify-center">
              <button
                type="button"
                title={`${BALL_LABELS[ball]} (${status})`}
                onClick={() => {
                  if (!details.isPotCommandAvailable || isPotted) return
                  setSelectedBalls((prev) => (prev.includes(ball) ? prev.filter((b) => b !== ball) : [...prev, ball]))
                }}
                style={{
                  width: status === 'object' ? '100%' : '80%',
                  maxWidth: status === 'object' ? '48px' : '38px',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  background: colors.bg,
                  border: isSelected ? '2.5px solid var(--a-amber)' : `1.5px solid ${colors.border}`,
                  boxShadow: isSelected
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

      {(details.commandSections.primary.A.length > 0 || details.commandSections.primary.B.length > 0) && (
        <CommandRows
          title="Primary"
          commands={details.commandSections.primary}
          selectedBalls={selectedBalls}
          onSubmit={submitCommand}
        />
      )}

      {(details.commandSections.secondary.A.length > 0 || details.commandSections.secondary.B.length > 0) && (
        <CommandRows
          title="Secondary"
          commands={details.commandSections.secondary}
          selectedBalls={selectedBalls}
          onSubmit={submitCommand}
        />
      )}

      {details.messages.map((message) => (
        <p
          key={`${message.type}:${message.text}`}
          className={`px-4 pt-2 text-sm font-semibold ${message.type === 'warning' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {message.text}
        </p>
      ))}

      {hasTertiary && (
        <div className="grid gap-3">
          <button
            type="button"
            className="text-left text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? '▲ Сховати' : '··· Більше'}
          </button>
          {showTertiary && (
            <CommandRows
              title="Tertiary"
              commands={details.commandSections.tertiary}
              selectedBalls={selectedBalls}
              onSubmit={submitCommand}
            />
          )}
        </div>
      )}
    </div>
  )
}

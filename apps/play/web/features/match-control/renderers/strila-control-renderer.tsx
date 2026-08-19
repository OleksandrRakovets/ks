import type { ControlCommandPreset } from '@ks/core'
import { StrilaMeta, StrilaControlViewSchema, type StrilaBall } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { Button } from '@ks/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as v from 'valibot'

import { controlCommandEffect, controlCommandLabel } from './control-copy'
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

type SeatCommands = MatchControlRendererProps['commandSections']['primary']

function prominenceVariant(prominence: ControlCommandPreset['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'tertiary') return 'outline'
  return 'secondary'
}

function CommandRows({
  commands,
  selectedBalls,
  onSubmit,
}: {
  commands: SeatCommands
  selectedBalls: StrilaBall[]
  onSubmit: (command: ControlCommandPreset) => void
}) {
  const { t } = useTranslation()

  function renderButton(cmd: ControlCommandPreset, key: string) {
    const isPot = cmd.commandType === 'pot.record'
    const command = isPot ? { ...cmd.command, pottedBalls: selectedBalls } : cmd.command
    const preset = { ...cmd, command }
    const label = controlCommandLabel(t, cmd)
    const effect = controlCommandEffect(t, cmd)
    return (
      <div key={key} className="grid gap-1">
        <Button
          type="button"
          variant={prominenceVariant(cmd.prominence)}
          size="control"
          disabled={isPot && selectedBalls.length === 0}
          onClick={() => onSubmit(preset)}
        >
          {label}
        </Button>
        {effect && <p className="text-center text-base text-text-lo">{effect}</p>}
      </div>
    )
  }

  return (
    <section className="border-b border-divider px-4 py-2">
      <div className="grid grid-cols-2 gap-6">
        <div className="grid gap-3.5">{commands.A.map((cmd, index) => renderButton(cmd, `A-${cmd.commandType}-${index}`))}</div>
        <div className="grid gap-3.5">{commands.B.map((cmd, index) => renderButton(cmd, `B-${cmd.commandType}-${index}`))}</div>
      </div>
    </section>
  )
}

function NeutralCommandRows(props: { commands: ControlCommandPreset[]; onSubmit: (command: ControlCommandPreset) => void }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-divider px-4 py-2">
      <div className="mx-auto grid w-2/3 gap-3.5">
        {props.commands.map((command, index) => (
          <Button
            key={`${command.source}-${command.commandType}-${index}`}
            type="button"
            variant={prominenceVariant(command.prominence)}
            size="control"
            onClick={() => props.onSubmit(command)}
          >
            {controlCommandLabel(t, command)}
          </Button>
        ))}
      </div>
    </section>
  )
}

export function StrilaControlRenderer(props: MatchControlRendererProps) {
  const [selectedBalls, setSelectedBalls] = useState<StrilaBall[]>([])
  const [showTertiary, setShowTertiary] = useState(false)
  const { t } = useTranslation()

  const parsed = useMemo(() => v.safeParse(StrilaControlViewSchema, props.projection), [props.projection])
  const commandSections = props.commandSections
  const hasNeutral = commandSections.neutral.length > 0

  function submitCommand(command: ControlCommandPreset) {
    setSelectedBalls([])
    props.onSubmitCommand(command)
  }

  if (!parsed.success) {
    return (
      <div aria-label={t(keys.match.control.strila.container)} className="grid">
        {hasNeutral ? <NeutralCommandRows commands={commandSections.neutral} onSubmit={submitCommand} /> : null}
      </div>
    )
  }

  const details = parsed.output.details
  const hasPrimary = commandSections.primary.A.length > 0 || commandSections.primary.B.length > 0
  const hasSecondary = commandSections.secondary.A.length > 0 || commandSections.secondary.B.length > 0
  const hasTertiary = commandSections.tertiary.A.length > 0 || commandSections.tertiary.B.length > 0

  return (
    <div aria-label={t(keys.match.control.strila.container)} className="grid">
      <p className="sr-only">{t(keys.match.control.choosePottedBall)}</p>
      <div
        aria-label={t(keys.match.control.strila.ballGrid)}
        className="mx-auto grid gap-1.5 border-b border-divider px-4 py-2"
        style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', justifyContent: 'center', width: 'min(100%, 528px)' }}
      >
        {StrilaMeta.allBalls.map((ball) => {
          const colors = BALL_COLORS[ball]
          const status = details.ballStatuses[ball]
          const ballLabel = t(keys.match.control.strila.ballLabel, {
            ball: t(`match.control.strila.balls.${ball}`),
            status: t(`match.control.strila.ballStatus.${status}`),
          })
          const isPotted = status === 'potted'
          const isSelected = details.isPotCommandAvailable && selectedBalls.includes(ball) && !isPotted
          return (
            <div key={ball} className="flex items-center justify-center">
              <button
                type="button"
                aria-label={ballLabel}
                title={ballLabel}
                onClick={() => {
                  if (!details.isPotCommandAvailable || isPotted) return
                  setSelectedBalls((prev) => (prev.includes(ball) ? prev.filter((b) => b !== ball) : [...prev, ball]))
                }}
                style={{
                  width: 'min(100%, 56px)',
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

      {hasNeutral && <NeutralCommandRows commands={commandSections.neutral} onSubmit={submitCommand} />}

      {hasPrimary && <CommandRows commands={commandSections.primary} selectedBalls={selectedBalls} onSubmit={submitCommand} />}

      {hasSecondary && (
        <CommandRows commands={commandSections.secondary} selectedBalls={selectedBalls} onSubmit={submitCommand} />
      )}

      {details.messages.map((message) => (
        <p
          key={`${message.type}:${message.code}`}
          className={`px-4 pt-2 text-base leading-tight font-semibold ${message.type === 'warning' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {t(`match.control.messages.${message.code}`)}
        </p>
      ))}

      {hasTertiary && (
        <div className="grid gap-3">
          <button
            type="button"
            className="px-4 py-3 text-left text-base text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? t(keys.match.control.showLess) : t(keys.match.control.showMore)}
          </button>
          {showTertiary && (
            <CommandRows commands={commandSections.tertiary} selectedBalls={selectedBalls} onSubmit={submitCommand} />
          )}
        </div>
      )}
    </div>
  )
}

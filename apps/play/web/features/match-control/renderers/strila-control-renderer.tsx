import type { Control, MatchCommand } from '@ks/core'
import { type StrilaBall, type StrilaControlView, StrilaMeta } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'

import { controlEffect, controlLabel } from './control-copy'
import { matchCommandFromControl, type MatchControlRendererProps } from './types'

const BALL_COLORS = {
  0: { bg: '#F0EDE6', border: '#C0BDB5' },
  1: { bg: '#C8102E', border: '#9E0E24' },
  2: { bg: '#F5C518', border: '#C9A00E' },
  3: { bg: '#00A550', border: '#008040' },
  4: { bg: '#7B4F2E', border: '#5C3A1E' },
  5: { bg: '#005EB8', border: '#004A92' },
  6: { bg: '#E8729A', border: '#C85580' },
  7: { bg: '#2a2a2a', border: '#555555' },
} satisfies Record<StrilaBall, { bg: string; border: string }>

type SeatControls = MatchControlRendererProps<StrilaControlView>['controlSections']['primary']

function strilaCommandLabel(t: TFunction, command: Control, index: number): string {
  if (command.type !== 'penalty.select') return controlLabel(t, command)
  if (index === 0) return t('match.control.controls.game.penalty.select.play-from-position')
  if (index === 1) return t('match.control.controls.game.penalty.select.pass-position')
  return t('match.control.controls.game.penalty.select.ball-in-hand')
}

function prominenceVariant(prominence: Control['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'tertiary') return 'outline'
  return 'secondary'
}

function ControlRows({
  controls,
  selectedBalls,
  onSubmit,
}: {
  controls: SeatControls
  selectedBalls: StrilaBall[]
  onSubmit: (command: MatchCommand) => void
}) {
  const { t } = useTranslation()

  function renderButton(cmd: Control, key: string, index: number) {
    const isPot = cmd.type === 'pot.record'
    const label = strilaCommandLabel(t, cmd, index)
    const effect = controlEffect(t, cmd)
    return (
      <div key={key} className="grid gap-1">
        <Button
          type="button"
          variant={prominenceVariant(cmd.prominence)}
          size="control"
          disabled={isPot && selectedBalls.length === 0}
          onClick={() => onSubmit(matchCommandFromControl(cmd, isPot ? { pottedBalls: selectedBalls } : {}))}
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
        <div className="grid gap-3.5">{controls.A.map((cmd, index) => renderButton(cmd, `A-${cmd.type}-${index}`, index))}</div>
        <div className="grid gap-3.5">{controls.B.map((cmd, index) => renderButton(cmd, `B-${cmd.type}-${index}`, index))}</div>
      </div>
    </section>
  )
}

function NeutralControlRows(props: { controls: Control[]; onSubmit: (command: MatchCommand) => void }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-divider px-4 py-2">
      <div className="mx-auto grid w-2/3 gap-3.5">
        {props.controls.map((command, index) => (
          <Button
            key={`${command.source}-${command.type}-${index}`}
            type="button"
            variant={prominenceVariant(command.prominence)}
            size="control"
            onClick={() => props.onSubmit(matchCommandFromControl(command))}
          >
            {controlLabel(t, command)}
          </Button>
        ))}
      </div>
    </section>
  )
}

export function StrilaControlRenderer(props: MatchControlRendererProps<StrilaControlView>) {
  const [selectedBalls, setSelectedBalls] = useState<StrilaBall[]>([])
  const [showTertiary, setShowTertiary] = useState(false)
  const { t } = useTranslation()

  const controlSections = props.controlSections
  const hasNeutral = controlSections.neutral.length > 0

  function submitCommand(command: MatchCommand) {
    setSelectedBalls([])
    props.onSubmitCommand(command)
  }

  const details = props.projection.details
  const hasPrimary = controlSections.primary.A.length > 0 || controlSections.primary.B.length > 0
  const hasSecondary = controlSections.secondary.A.length > 0 || controlSections.secondary.B.length > 0
  const hasTertiary = controlSections.tertiary.A.length > 0 || controlSections.tertiary.B.length > 0

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

      {hasNeutral && <NeutralControlRows controls={controlSections.neutral} onSubmit={submitCommand} />}

      {hasPrimary && <ControlRows controls={controlSections.primary} selectedBalls={selectedBalls} onSubmit={submitCommand} />}

      {hasSecondary && (
        <ControlRows controls={controlSections.secondary} selectedBalls={selectedBalls} onSubmit={submitCommand} />
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
            <ControlRows controls={controlSections.tertiary} selectedBalls={selectedBalls} onSubmit={submitCommand} />
          )}
        </div>
      )}
    </div>
  )
}

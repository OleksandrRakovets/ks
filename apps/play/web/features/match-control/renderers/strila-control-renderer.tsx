import { type Control, groupControlsIntoSections, type MatchCommand } from '@ks/core'
import { type StrilaBall, type StrilaGamePresentation, StrilaMeta } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'
import { cn } from '@/components/ui/utils'

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

type StrilaRuleNote = StrilaGamePresentation['details']['ruleNotes'][number]

type RuleMessageLine = { player?: string; text: string }

function ruleMessageLines(
  t: TFunction,
  message: StrilaRuleNote,
  participants: MatchControlRendererProps<StrilaGamePresentation>['participants'],
): RuleMessageLine[] {
  switch (message.code) {
    case 'cue-ball-and-colored-is-foul':
    case 'manual-foul-cue-ball-response':
    case 'respotted-black-opening':
      return [{ text: t(`match.control.messages.${message.code}`) }]
    case 'third-consecutive-cue-ball-pot':
      return [
        {
          player: participants[message.seat].displayName,
          text: t('match.control.messages.third-consecutive-cue-ball-pot'),
        },
      ]
    case 'last-colored-ball-pot-outcomes':
      return message.outcomes.map(({ seat, result }) => ({
        player: participants[seat].displayName,
        text:
          result.type === 'winner-determined' && result.winnerSeat === seat
            ? t('match.control.messages.last-colored-ball-frame-ball', {
                ball: t(`match.control.strila.balls.${message.ball}`),
              })
            : result.type === 'respotted-black'
              ? t('match.control.messages.last-colored-ball-pot-respots-black', {
                  ball: t(`match.control.strila.outcomeBalls.nominative.${message.ball}`),
                })
              : t('match.control.messages.last-colored-ball-pot-winner', {
                  ball: t(`match.control.strila.outcomeBalls.nominative.${message.ball}`),
                }),
      }))
  }

  throw new Error('Unsupported Strila rule note')
}

function OpenBookIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 size-4 shrink-0"
    >
      <path d="M2.5 4.75h5.25A4.25 4.25 0 0 1 12 9v10.25A4.25 4.25 0 0 0 7.75 15H2.5z" />
      <path d="M21.5 4.75h-5.25A4.25 4.25 0 0 0 12 9v10.25A4.25 4.25 0 0 1 16.25 15h5.25z" />
    </svg>
  )
}

function RuleNote(props: {
  message: StrilaRuleNote
  participants: MatchControlRendererProps<StrilaGamePresentation>['participants']
}) {
  const { t } = useTranslation()
  const warning = props.message.severity === 'warning'

  return (
    <section
      aria-label={t(`match.control.ruleNote.${props.message.severity}`)}
      className={cn(
        'flex gap-2.5 rounded-sm border border-l-3 px-3 py-2 text-sm leading-snug',
        warning ? 'border-amber/30 bg-amber-dim text-amber' : 'border-blue/30 bg-blue-dim text-blue',
      )}
    >
      <OpenBookIcon />
      <div className="grid gap-1 text-foreground">
        {ruleMessageLines(t, props.message, props.participants).map((line, index) => (
          <p key={index}>
            {line.player && <strong>{line.player}: </strong>}
            {line.text}
          </p>
        ))}
      </div>
    </section>
  )
}

export function StrilaScoreMarkers(props: { balls: readonly StrilaBall[]; align: 'left' | 'right' }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap gap-1.5',
        props.align === 'right' ? 'justify-end' : 'justify-start',
      )}
    >
      {props.balls.map((ball, index) => (
        <span
          key={`${ball}-${index}`}
          aria-hidden
          className="size-3.5 shrink-0 rounded-full"
          style={{ backgroundColor: BALL_COLORS[ball].bg }}
        />
      ))}
    </div>
  )
}

type SeatControls = ReturnType<typeof groupControlsIntoSections>['primary']

function strilaCommandLabel(t: TFunction, command: Control, index: number): string {
  if (command.type !== 'penalty.select') return controlLabel(t, command)

  if (index === 0) return t('match.control.commands.game.penalty.select.play-from-position')

  if (index === 1) return t('match.control.commands.game.penalty.select.pass-position')

  return t('match.control.commands.game.penalty.select.ball-in-hand')
}

function prominenceVariant(prominence: Control['prominence']): 'primary' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'primary'

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
        {effect && <p className="text-center text-base text-muted-foreground">{effect}</p>}
      </div>
    )
  }

  return (
    <section className="border-b border-divider px-4 py-2">
      <div className="grid grid-cols-2 gap-6">
        <div className="grid gap-3.5">
          {controls.A.map((cmd, index) => renderButton(cmd, `A-${cmd.type}-${index}`, index))}
        </div>
        <div className="grid gap-3.5">
          {controls.B.map((cmd, index) => renderButton(cmd, `B-${cmd.type}-${index}`, index))}
        </div>
      </div>
    </section>
  )
}

function NeutralControlRows(props: {
  controls: readonly Control[]
  onSubmit: (command: MatchCommand) => void
}) {
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

export function StrilaControlRenderer(props: MatchControlRendererProps<StrilaGamePresentation>) {
  const [selectedBalls, setSelectedBalls] = useState<StrilaBall[]>([])
  const [showTertiary, setShowTertiary] = useState(false)
  const { t } = useTranslation()

  const controlSections = groupControlsIntoSections(props.controls)
  const hasNeutral = controlSections.neutral.length > 0

  function submitCommand(command: MatchCommand) {
    setSelectedBalls([])
    props.onSubmitCommand(command)
  }

  const details = props.game.details
  const hasPrimary = controlSections.primary.A.length > 0 || controlSections.primary.B.length > 0
  const hasSecondary = controlSections.secondary.A.length > 0 || controlSections.secondary.B.length > 0
  const hasTertiary = controlSections.tertiary.A.length > 0 || controlSections.tertiary.B.length > 0

  return (
    <div aria-label={t(keys.match.control.strila.container)} className="grid">
      <fieldset className="mx-auto grid w-full max-w-[528px] min-w-0 grid-cols-8 gap-1.5 border-b border-divider px-4 py-2">
        <legend className="sr-only">{t(keys.match.control.choosePottedBall)}</legend>
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
            <button
              key={ball}
              type="button"
              aria-label={ballLabel}
              aria-pressed={isSelected}
              title={ballLabel}
              disabled={!details.isPotCommandAvailable || isPotted}
              className="group flex h-14 w-full items-center justify-center outline-none disabled:cursor-not-allowed"
              onClick={() => {
                if (!details.isPotCommandAvailable || isPotted) return
                setSelectedBalls((prev) =>
                  prev.includes(ball) ? prev.filter((b) => b !== ball) : [...prev, ball],
                )
              }}
            >
              <span
                aria-hidden
                className="block shrink-0 rounded-full group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring group-focus-visible:outline-solid"
                style={{
                  width: status === 'object' ? 'min(100%, 48px)' : 'min(80%, 38px)',
                  aspectRatio: '1',
                  background: colors.bg,
                  border: `1.5px solid ${colors.border}`,
                  boxShadow: isSelected
                    ? '0 0 0 2px var(--background), 0 0 0 5px var(--ring), 0 3px 8px rgba(0,0,0,0.6)'
                    : isPotted
                      ? 'none'
                      : '0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
                  opacity: isPotted ? 0.3 : 1,
                  transform: isSelected ? 'translateY(-1px)' : undefined,
                  transition: 'box-shadow 0.1s, opacity 0.2s, transform 0.1s',
                }}
              />
            </button>
          )
        })}
      </fieldset>

      {details.ruleNotes.length > 0 && (
        <div className="grid gap-2 border-b border-divider px-4 py-2">
          {details.ruleNotes.map((message, index) => (
            <RuleNote
              key={`${message.severity}:${message.code}:${index}`}
              message={message}
              participants={props.participants}
            />
          ))}
        </div>
      )}

      {hasNeutral && <NeutralControlRows controls={controlSections.neutral} onSubmit={submitCommand} />}

      {hasPrimary && (
        <ControlRows
          controls={controlSections.primary}
          selectedBalls={selectedBalls}
          onSubmit={submitCommand}
        />
      )}

      {hasSecondary && (
        <ControlRows
          controls={controlSections.secondary}
          selectedBalls={selectedBalls}
          onSubmit={submitCommand}
        />
      )}

      {hasTertiary && (
        <div className="grid gap-3">
          <button
            type="button"
            aria-expanded={showTertiary}
            className="flex items-center gap-2 px-4 py-3 text-left text-base text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            onClick={() => setShowTertiary((v) => !v)}
          >
            <span aria-hidden className={cn(!showTertiary && 'rotate-180')}>
              ▲
            </span>
            {showTertiary ? t(keys.match.control.showLess) : t(keys.match.control.showMore)}
          </button>
          {showTertiary && (
            <ControlRows
              controls={controlSections.tertiary}
              selectedBalls={selectedBalls}
              onSubmit={submitCommand}
            />
          )}
        </div>
      )}
    </div>
  )
}

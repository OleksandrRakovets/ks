import { type Control, groupControlsIntoSections, opponentOf } from '@ks/core'
import { type StrilaBall, type StrilaGamePresentation, StrilaMeta } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/components/ui/utils'

import { ActionStack, type ControlPresentation, Takeover } from '../shell'
import { STRILA_BALL_COLORS } from '../strila-balls'
import { controlEffect, controlLabel } from './control-copy'
import type { MatchControlRendererProps } from './types'

type StrilaRuleNote = StrilaGamePresentation['details']['ruleNotes'][number]

export function StrilaControlRenderer(props: MatchControlRendererProps<StrilaGamePresentation>) {
  const { t } = useTranslation()
  const [selectedBalls, setSelectedBalls] = useState<StrilaBall[]>([])
  const sections = groupControlsIntoSections(props.controls)
  const details = props.game.details

  const penaltyControls =
    details.phase === 'foul-committed.penalty-selection'
      ? [...sections.primary.A, ...sections.primary.B, ...sections.secondary.A, ...sections.secondary.B]
      : []

  function submit(command: Parameters<typeof props.onSubmitCommand>[0]) {
    setSelectedBalls([])
    props.onSubmitCommand(command)
  }

  const renderControl = (control: Control): ControlPresentation => {
    const label = strilaControlLabel(t, control)
    const isPot = control.type === 'pot.record'

    return {
      label: isPot ? <PotLabel label={label} selectedBalls={selectedBalls} /> : label,
      visibleLabel: label,
      disabled: isPot && selectedBalls.length === 0,
      input: isPot ? { pottedBalls: selectedBalls } : undefined,
      effect: controlEffect(t, control),
    }
  }

  return (
    <ActionStack
      sections={sections}
      selector={
        details.isPotCommandAvailable ? (
          <BallSelector
            details={details}
            participants={props.participants}
            selectedBalls={selectedBalls}
            onSelectionChange={setSelectedBalls}
          />
        ) : undefined
      }
      takeover={
        penaltyControls.length > 0 ? (
          <PenaltyTakeover
            controls={penaltyControls}
            details={details}
            participants={props.participants}
            renderControl={renderControl}
            submitting={props.submitting}
            onSubmit={submit}
          />
        ) : undefined
      }
      renderControl={renderControl}
      submitting={props.submitting}
      onSubmit={submit}
    />
  )
}

function PenaltyTakeover(props: {
  controls: readonly Control[]
  details: StrilaGamePresentation['details']
  participants: MatchControlRendererProps<StrilaGamePresentation>['participants']
  renderControl: (control: Control, index: number) => ControlPresentation
  submitting: boolean
  onSubmit: MatchControlRendererProps<StrilaGamePresentation>['onSubmitCommand']
}) {
  const { t } = useTranslation()
  const chooser = props.controls[0]?.seat

  if (!chooser) return null
  const offender = opponentOf(chooser)

  return (
    <Takeover
      title={
        <>
          <span>
            {t(keys.match.control.takeover.foulActor, { player: props.participants[offender].displayName })}
          </span>{' '}
          <span className="font-normal text-text-lo">
            {t(keys.match.control.takeover.foulChooser, { player: props.participants[chooser].displayName })}
          </span>
        </>
      }
      note={<RuleNotes notes={props.details.ruleNotes} participants={props.participants} />}
      controls={props.controls}
      renderControl={props.renderControl}
      submitting={props.submitting}
      onSubmit={props.onSubmit}
    />
  )
}

function BallSelector(props: {
  details: StrilaGamePresentation['details']
  participants: MatchControlRendererProps<StrilaGamePresentation>['participants']
  selectedBalls: StrilaBall[]
  onSelectionChange: (balls: StrilaBall[]) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-1 px-3 pb-3.5 [@media(min-height:740px)]:pb-4 [@media(min-height:820px)]:pb-5">
      <RuleNotes notes={props.details.ruleNotes} participants={props.participants} />
      <p className="px-1 text-[14px] leading-snug text-text-lo">{t(keys.match.control.choosePottedBall)}</p>
      <fieldset className="grid min-w-0 grid-cols-8 gap-1">
        <legend className="sr-only">{t(keys.match.control.choosePottedBall)}</legend>
        {StrilaMeta.allBalls.map((ball) => {
          const colors = STRILA_BALL_COLORS[ball]
          const status = props.details.ballStatuses[ball]
          const potted = status === 'potted'
          const selected = props.selectedBalls.includes(ball) && !potted

          const label = t(keys.match.control.strila.ballLabel, {
            ball: t(`match.control.strila.balls.${ball}`),
            status: t(`match.control.strila.ballStatus.${status}`),
          })

          return (
            <button
              key={ball}
              type="button"
              aria-label={label}
              aria-pressed={selected}
              disabled={potted}
              className="group grid h-12 min-w-0 place-items-center rounded-full outline-none disabled:opacity-25"
              onClick={() =>
                props.onSelectionChange(
                  selected
                    ? props.selectedBalls.filter((candidate) => candidate !== ball)
                    : [...props.selectedBalls, ball],
                )
              }
            >
              <span
                aria-hidden
                className={cn(
                  'block aspect-square rounded-full border-[1.5px] shadow-[var(--ball-shadow)]',
                  status === 'object' ? 'w-full max-w-12' : 'w-4/5 max-w-[38px]',
                  'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring',
                )}
                style={{
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  boxShadow: selected
                    ? '0 0 0 2px var(--c-raised), 0 0 0 5px var(--a-amber), var(--ball-shadow)'
                    : undefined,
                }}
              />
            </button>
          )
        })}
      </fieldset>
    </div>
  )
}

function PotLabel({ label, selectedBalls }: { label: string; selectedBalls: readonly StrilaBall[] }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
      <span>{label}</span>
      {selectedBalls.map((ball) => (
        <span
          key={ball}
          aria-hidden
          className="size-3 rounded-full shadow-[var(--ball-shadow)]"
          style={{ backgroundColor: STRILA_BALL_COLORS[ball].background }}
        />
      ))}
    </span>
  )
}

function RuleNotes(props: {
  notes: readonly StrilaRuleNote[]
  participants: MatchControlRendererProps<StrilaGamePresentation>['participants']
}) {
  if (props.notes.length === 0) return null

  return (
    <div className="grid gap-2">
      {props.notes.map((note, index) => (
        <RuleNote
          key={`${note.severity}-${note.code}-${index}`}
          note={note}
          participants={props.participants}
        />
      ))}
    </div>
  )
}

function RuleNote(props: {
  note: StrilaRuleNote
  participants: MatchControlRendererProps<StrilaGamePresentation>['participants']
}) {
  const { t } = useTranslation()

  return (
    <aside className="flex gap-2 rounded-lg bg-blue-dim px-3 py-2 text-base leading-snug">
      <OpenBookIcon />
      <div>
        {ruleMessageLines(t, props.note, props.participants).map((line, index) => (
          <p key={index}>
            {line.player !== undefined && line.player.length > 0 ? <strong>{line.player}: </strong> : null}
            {line.text}
          </p>
        ))}
      </div>
    </aside>
  )
}

function strilaControlLabel(t: TFunction, control: Control): string {
  if (control.type !== 'penalty.select') return controlLabel(t, control)

  const choice = control.fixedInput.choice

  if (choice === 'play-from-position')
    return t('match.control.commands.game.penalty.select.play-from-position')

  if (choice === 'pass-position') return t('match.control.commands.game.penalty.select.pass-position')

  if (choice === 'ball-in-hand') return t('match.control.commands.game.penalty.select.ball-in-hand')

  return t('match.control.commands.game.penalty.select.default')
}

function ruleMessageLines(
  t: TFunction,
  note: StrilaRuleNote,
  participants: MatchControlRendererProps<StrilaGamePresentation>['participants'],
): { player?: string; text: string }[] {
  switch (note.code) {
    case 'cue-ball-and-colored-is-foul':
    case 'manual-foul-cue-ball-response':
    case 'respotted-black-opening':
      return [{ text: t(`match.control.messages.${note.code}`) }]
    case 'third-consecutive-cue-ball-pot':
      return [
        {
          player: participants[note.seat].displayName,
          text: t('match.control.messages.third-consecutive-cue-ball-pot'),
        },
      ]
    case 'last-colored-ball-pot-outcomes':
      return note.outcomes.map(({ seat, result }) => ({
        player: participants[seat].displayName,
        text:
          result.type === 'winner-determined' && result.winnerSeat === seat
            ? t('match.control.messages.last-colored-ball-frame-ball', {
                ball: t(`match.control.strila.balls.${note.ball}`),
              })
            : result.type === 'respotted-black'
              ? t('match.control.messages.last-colored-ball-pot-respots-black', {
                  ball: t(`match.control.strila.outcomeBalls.nominative.${note.ball}`),
                })
              : t('match.control.messages.last-colored-ball-pot-winner', {
                  ball: t(`match.control.strila.outcomeBalls.nominative.${note.ball}`),
                }),
      }))
  }

  return []
}

function OpenBookIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="mt-0.5 size-5 shrink-0 text-blue">
      <path
        d="M2.5 4.75h5.25A4.25 4.25 0 0 1 12 9v10.25A4.25 4.25 0 0 0 7.75 15H2.5zm19 0h-5.25A4.25 4.25 0 0 0 12 9v10.25A4.25 4.25 0 0 1 16.25 15h5.25z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

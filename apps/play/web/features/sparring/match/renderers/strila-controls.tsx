import type { Seat } from '@ks/core'
import type { StrilaBall as StrilaBallValue } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { SeatChoiceToss } from '@/components/seat-choice-toss'
import { StrilaBall } from '@/components/strila-ball'
import { cn } from '@/components/ui/utils'

import type { BallSetPresentation, RuleNotePresentation } from './strila-presentation'

export function BallSet(props: {
  presentation: BallSetPresentation
  notes: readonly RuleNotePresentation[]
  onToggle: (ball: typeof StrilaBallValue.Type) => void
}) {
  return (
    <div className="grid gap-1 px-3 pb-3.5 [@media(min-height:740px)]:pb-4 [@media(min-height:820px)]:pb-5">
      <RuleNotes notes={props.notes} />
      {props.presentation.hint !== undefined ? (
        <p className="mb-1 px-1 text-[14px] leading-snug text-muted-foreground [@media(min-height:740px)]:mb-3 [@media(min-height:820px)]:mb-4">
          {props.presentation.hint}
        </p>
      ) : null}
      <fieldset className="grid min-w-0 grid-cols-8 gap-1">
        <legend className="sr-only">{props.presentation.legend}</legend>
        {props.presentation.balls.map((item) => (
          <button
            key={item.ball}
            type="button"
            aria-label={item.label}
            aria-pressed={item.selectable ? item.selected : undefined}
            disabled={item.disabled}
            className={cn(
              'group grid h-12 min-w-0 place-items-center rounded-full outline-none',
              item.potted && 'opacity-25',
            )}
            onClick={() => props.onToggle(item.ball)}
          >
            <StrilaBall
              ball={item.ball}
              selected={item.selected}
              className={cn(
                'aspect-square',
                item.object ? 'w-full max-w-12' : 'w-4/5 max-w-[38px]',
                'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring',
              )}
            />
          </button>
        ))}
      </fieldset>
    </div>
  )
}

export function OpeningToss(props: {
  notes: readonly RuleNotePresentation[]
  playerNames: { A: string; B: string }
  submitting: boolean
  onSelectedSeatChange: (seat: typeof Seat.Type | null) => void
}) {
  const { t } = useTranslation()

  return (
    <section
      className="grid gap-3 bg-raised px-3 py-3.5 [@media(min-height:740px)]:py-4 [@media(min-height:820px)]:py-5"
      aria-labelledby="respotted-black-opening-toss-heading"
    >
      <RuleNotes notes={props.notes} />
      <SeatChoiceToss
        headingId="respotted-black-opening-toss-heading"
        playerNames={props.playerNames}
        selectedSeat={null}
        disabled={props.submitting}
        title={t(keys.match.control.strila.openingToss.title)}
        coinInAir={t(keys.match.control.strila.openingToss.coinInAir)}
        chooseSeat={(winnerName) =>
          t(keys.match.control.strila.openingToss.chooseOpener, { name: winnerName })
        }
        tossCoin={t(keys.match.control.strila.openingToss.tossCoin)}
        seatChoiceLabel={(playerName) =>
          t(keys.match.control.strila.openingToss.playerOpens, { name: playerName })
        }
        onSelectedSeatChange={props.onSelectedSeatChange}
      />
    </section>
  )
}

export function PenaltyTitle(props: { offenderLabel: string; chooserLabel: string }) {
  return (
    <>
      <span>{props.offenderLabel}</span>{' '}
      <span className="font-normal text-muted-foreground">{props.chooserLabel}</span>
    </>
  )
}

export function PotLabel({
  label,
  selectedBalls,
}: {
  label: string
  selectedBalls: readonly (typeof StrilaBallValue.Type)[]
}) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
      <span>{label}</span>
      {selectedBalls.map((ball) => (
        <StrilaBall key={ball} ball={ball} className="size-3" />
      ))}
    </span>
  )
}

export function RuleNotes(props: { notes: readonly RuleNotePresentation[] }) {
  if (props.notes.length === 0) return null

  return (
    <div className="grid gap-2">
      {props.notes.map((note) => (
        <aside key={note.key} className="flex gap-2 rounded-lg bg-info-dim px-3 py-2 text-base leading-snug">
          <OpenBookIcon />
          <div>
            {note.lines.map((line, index) => (
              <p key={index}>
                {line.player !== undefined && line.player.length > 0 ? <strong>{line.player}: </strong> : null}
                {line.text}
              </p>
            ))}
          </div>
        </aside>
      ))}
    </div>
  )
}

function OpenBookIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="mt-0.5 size-5 shrink-0 text-info">
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

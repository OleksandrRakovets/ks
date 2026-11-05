import type { ProtocolRow } from '@ks/application'
import type { BySeatNumber, Seat } from '@ks/core'
import { keys } from '@ks/i18n'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CorrectionIcon } from '@/components/correction-icon'
import { StrilaBall } from '@/components/strila-ball'
import { cn } from '@/components/ui/utils'
import { protocolRowLabel } from '@/features/sparring/match/protocol/protocol-copy'
import {
  formatProtocolDuration,
  formatProtocolPoints,
  presentProtocolItems,
} from '@/features/sparring/match/protocol/protocol-presentation'

type LaneRow = Extract<ProtocolRow, { kind: 'lane' }>

/**
 * Seat A's lane, the score spine, and seat B's lane share one five-column grid. The two score tracks have the
 * same fixed width, so the colon sits on the panel's centre line in every row, as it does in the centred bands.
 */
export function ProtocolPanel(props: {
  rows: readonly ProtocolRow[]
  names: BySeatNames
  showsFrames: boolean
  emptyLabel: string
  /** Active matches put the latest action at the top, where observers keep the page. */
  newestFirst: boolean
}) {
  const { t } = useTranslation()
  const [openKey, setOpenKey] = useState<string | null>(null)
  const hasRows = props.rows.length > 0
  const toggle = (key: string) => () => setOpenKey((current) => (current === key ? null : key))

  if (!hasRows) return <p className="px-4 py-3 text-base text-muted-foreground">{props.emptyLabel}</p>

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_3.5rem_auto_3.5rem_minmax(0,1fr)] pt-3 pb-6">
      <div className="col-span-5 grid grid-cols-subgrid px-4 pb-3 text-base text-muted-foreground">
        <span className="min-w-0 break-words">{props.names.A}</span>
        <span className="col-span-3" />
        <span className="min-w-0 text-right break-words">{props.names.B}</span>
      </div>
      <ol className="col-span-5 grid grid-cols-subgrid">
        {presentProtocolItems(props.rows, {
          showsFrames: props.showsFrames,
          newestFirst: props.newestFirst,
        }).map((item) => {
          if (item.kind === 'frame-header')
            return (
              <li key={item.key} className="col-span-5 px-4 pt-5 pb-1 text-center text-base font-semibold">
                {t(keys.match.scoreboard.frameWithNumber, { frameIndex: item.frameIndex })}
              </li>
            )

          const { row } = item

          switch (row.kind) {
            case 'lane':
              return (
                <LaneItem
                  key={row.key}
                  row={row}
                  name={props.names[row.seat]}
                  timeMarker={item.timeMarker}
                  open={openKey === row.key}
                  onToggle={toggle(row.key)}
                />
              )
            case 'note':
              return (
                <TimedItem key={row.key} row={row} open={openKey === row.key} onToggle={toggle(row.key)}>
                  <span className="rounded-full bg-info-dim px-3 py-0.5 text-center text-base text-info">
                    {protocolRowLabel(t, row)}
                  </span>
                </TimedItem>
              )
            case 'rack':
              return (
                <TimedItem key={row.key} row={row} open={openKey === row.key} onToggle={toggle(row.key)}>
                  <Band
                    className="bg-info-dim py-2 text-info"
                    scoreClassName="text-xl"
                    captionClassName="opacity-80"
                    score={row.score}
                    names={props.names}
                    caption={[
                      t(keys.match.protocol.rack, { rackNumber: row.rackNumber }),
                      formatProtocolDuration(t, row.durationMs),
                    ]}
                  />
                </TimedItem>
              )
            case 'frame-result':
              return (
                <TimedItem key={row.key} row={row} open={openKey === row.key} onToggle={toggle(row.key)}>
                  <Band
                    className="bg-raised py-3"
                    scoreClassName="text-2xl"
                    captionClassName="text-muted-foreground"
                    names={props.names}
                    score={props.showsFrames ? row.framesWonBySeat : row.pointsBySeat}
                    caption={[
                      props.showsFrames
                        ? t(keys.match.protocol.frameResult, {
                            frameIndex: row.frameIndex,
                            name: props.names[row.winnerSeat],
                          })
                        : props.names[row.winnerSeat],
                      formatProtocolDuration(t, row.durationMs),
                    ]}
                  />
                </TimedItem>
              )
            case 'match-ended':
              return (
                <li key={row.key} className="col-span-5 px-4 py-2 text-center text-base text-muted-foreground">
                  {t(keys.match.protocol.effectiveTime, {
                    duration: formatProtocolDuration(t, row.effectiveDurationMs),
                  })}
                </li>
              )
          }

          return null
        })}
      </ol>
    </section>
  )
}

type BySeatNames = Readonly<{ A: string; B: string }>

function LaneItem(props: {
  row: LaneRow
  name: string
  timeMarker: string | undefined
  open: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const { row } = props

  const lane = (
    <span
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 py-2.5 break-words',
        row.seat === 'A' ? 'justify-end pr-2.5 pl-4 text-right' : 'pr-4 pl-2.5',
      )}
    >
      <LaneLabel row={row} />
      {row.corrected ? (
        <>
          <CorrectionIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">{t(keys.match.protocol.corrected)}</span>
        </>
      ) : null}
    </span>
  )

  return (
    <li className="relative col-span-5 grid grid-cols-subgrid">
      {props.timeMarker !== undefined ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-[7px] left-4 text-[14px] leading-none text-muted-foreground tabular-nums"
        >
          {props.timeMarker}
        </span>
      ) : null}
      <button
        type="button"
        aria-expanded={props.open}
        onClick={props.onToggle}
        className={cn(
          'col-span-5 grid grid-cols-subgrid items-center text-left text-base outline-offset-[-2px]',
          props.open && 'bg-raised',
        )}
      >
        {/* Out of the grid flow, so both seats read "Name: label score". */}
        <span className="sr-only">{`${props.name}: `}</span>
        {row.seat === 'A' ? lane : <span />}
        <span className="col-span-3 grid min-h-full grid-cols-subgrid content-center border-x border-divider py-1.5">
          {row.score ? <SpineScore score={row.score} changedSeats={row.changedSeats} /> : null}
          {props.open ? (
            // Out of flow horizontally, so revealed times never widen the spine columns of other rows.
            <span className={cn('relative col-span-3', row.corrected ? 'h-9' : 'h-[18px]')}>
              <span className="absolute left-1/2 grid -translate-x-1/2 justify-items-center text-[14px] leading-[18px] whitespace-nowrap text-amber tabular-nums">
                <time dateTime={row.acceptedAtIso}>{row.acceptedAtLabel}</time>
                {row.corrected ? (
                  <time dateTime={row.corrected.acceptedAtIso}>
                    <span aria-hidden className="inline-flex items-center gap-1">
                      <CorrectionIcon className="size-3.5" />
                      {row.corrected.acceptedAtLabel}
                    </span>
                    <span className="sr-only">
                      {t(keys.match.protocol.correctedAt, { time: row.corrected.acceptedAtLabel })}
                    </span>
                  </time>
                ) : null}
              </span>
            </span>
          ) : null}
        </span>
        {row.seat === 'B' ? lane : <span />}
      </button>
    </li>
  )
}

function LaneLabel({ row }: { row: LaneRow }) {
  const { t } = useTranslation()
  const struck = row.corrected !== undefined

  const tone = cn(
    struck && 'text-muted-foreground line-through',
    !struck && row.action === 'foul.commit' && 'text-destructive',
    !struck && (row.action === 'frame.commence' || row.action === 'frame.concede') && 'text-muted-foreground',
  )

  if (!row.message.pottedBalls) return <span className={tone}>{protocolRowLabel(t, row)}</span>

  return (
    <>
      <span className="sr-only">{protocolRowLabel(t, row)}</span>
      {/* Wraps within the lane, so a pot of all eight balls never overflows a narrow phone. */}
      <span
        aria-hidden
        className={cn(
          'flex max-w-full min-w-0 flex-wrap gap-1',
          row.seat === 'A' && 'justify-end',
          struck && 'opacity-50',
        )}
      >
        {row.message.pottedBalls.map((ball) => (
          <span key={ball} className="relative">
            <StrilaBall ball={ball} className="size-5" />
            {struck ? <span className="absolute -inset-x-0.5 top-1/2 h-px bg-muted-foreground" /> : null}
          </span>
        ))}
      </span>
    </>
  )
}

function SpineScore({ score, changedSeats }: { score: BySeatNumber; changedSeats: readonly Seat[] }) {
  const tone = (seat: Seat) =>
    changedSeats.includes(seat) ? 'font-bold text-foreground' : 'text-muted-foreground'

  return (
    <>
      <ScoreNumber className={cn('pr-1.5 text-right text-xl', tone('A'))} points={score.A} />
      <span className="text-xl text-muted-foreground">:</span>
      <ScoreNumber className={cn('pl-1.5 text-xl', tone('B'))} points={score.B} />
    </>
  )
}

/** Bands and notes reveal the stored entry's exact time on tap, like lane rows. */
function TimedItem(props: {
  row: Exclude<ProtocolRow, LaneRow>
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <li className="col-span-5 px-4 py-1.5">
      <button
        type="button"
        aria-expanded={props.open}
        onClick={props.onToggle}
        className={cn(
          'grid w-full justify-items-center gap-1 rounded-xl py-0.5',
          props.open && 'bg-raised/60',
        )}
      >
        {props.children}
        {props.open ? (
          <time className="text-[14px] text-amber tabular-nums" dateTime={props.row.acceptedAtIso}>
            {props.row.acceptedAtLabel}
          </time>
        ) : null}
      </button>
    </li>
  )
}

/**
 * A raised band with a fixed-colon score above a muted caption. Like the Board, the leader is bold and the
 * trailer muted; seat names are announced because the band itself has no lanes.
 */
function Band(props: {
  score: BySeatNumber
  names: BySeatNames
  caption: readonly string[]
  className: string
  scoreClassName: string
  captionClassName: string
}) {
  const { A, B } = props.score
  const tone = (points: number, other: number) => (points < other ? 'text-muted-foreground' : 'font-bold')

  return (
    <span
      className={cn(
        'grid w-full min-w-0 grid-cols-[minmax(0,1fr)] justify-items-center gap-0.5 rounded-xl px-4',
        props.className,
      )}
    >
      <span className={cn('grid grid-cols-[1fr_auto_1fr] self-stretch', props.scoreClassName)}>
        <span className={cn('pr-2 text-right', tone(A, B))}>
          <span className="sr-only">{`${props.names.A} `}</span>
          <ScoreNumber points={A} />
        </span>
        <span className="opacity-70">:</span>
        <span className={cn('pl-2', tone(B, A))}>
          <span className="sr-only">{`${props.names.B} `}</span>
          <ScoreNumber points={B} />
        </span>
      </span>
      <span
        className={cn('max-w-full text-center text-base [overflow-wrap:anywhere]', props.captionClassName)}
      >
        {props.caption.join(' · ')}
      </span>
    </span>
  )
}

function ScoreNumber(props: { points: number; className?: string }): ReactNode {
  return <span className={cn('tabular-nums', props.className)}>{formatProtocolPoints(props.points)}</span>
}

import type { ProtocolRow } from '@ks/application'
import type { BySeatNumber, Seat } from '@ks/core'
import { keys } from '@ks/i18n'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
 * Seat A's lane, the score spine, and seat B's lane share one five-column grid, so every row keeps the
 * colon in the same place: A's points right-aligned, the colon, then B's points left-aligned.
 */
export function ProtocolPanel(props: {
  rows: readonly ProtocolRow[]
  names: BySeatNames
  showsFrames: boolean
  emptyLabel: string
  /** Active matches open at the latest row, because new rows arrive at the end. */
  startAtLatest: boolean
}) {
  const { t } = useTranslation()
  const [openKey, setOpenKey] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const hasRows = props.rows.length > 0
  const { startAtLatest } = props

  useEffect(() => {
    if (startAtLatest && hasRows) endRef.current?.scrollIntoView({ block: 'end' })
    // Only on arrival: live updates must not pull a reader away from earlier rows.
  }, [startAtLatest, hasRows])

  if (!hasRows) return <p className="px-4 py-3 text-base text-muted-foreground">{props.emptyLabel}</p>

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_minmax(0,1fr)] pt-3 pb-6">
      <div className="col-span-5 grid grid-cols-subgrid px-4 pb-3 text-base text-muted-foreground">
        <span className="min-w-0 break-words">{props.names.A}</span>
        <span className="col-span-3" />
        <span className="min-w-0 text-right break-words">{props.names.B}</span>
      </div>
      <ol className="col-span-5 grid grid-cols-subgrid">
        {presentProtocolItems(props.rows, props.showsFrames).map((item) => {
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
                  onToggle={() => setOpenKey((current) => (current === row.key ? null : row.key))}
                />
              )
            case 'note':
              return (
                <li key={row.key} className="col-span-5 flex justify-center px-4 py-2">
                  <span className="rounded-full bg-info-dim px-3 py-0.5 text-center text-base text-info">
                    {protocolRowLabel(t, row)}
                  </span>
                </li>
              )
            case 'rack':
              return (
                <li key={row.key} className="col-span-5 px-4 py-1.5">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-5 rounded-xl bg-info-dim px-4 py-2 text-info">
                    <ScoreNumber className="text-right text-xl font-bold" points={row.score.A} />
                    <span className="grid justify-items-center text-base">
                      {t(keys.match.protocol.rack, { rackNumber: row.rackNumber })}
                      <span className="text-[14px] opacity-80">
                        {formatProtocolDuration(t, row.durationMs)}
                      </span>
                    </span>
                    <ScoreNumber className="text-xl font-bold" points={row.score.B} />
                  </div>
                </li>
              )
            case 'frame-result':
              return (
                <li key={row.key} className="col-span-5 px-4 py-2">
                  <FrameResultBand
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
                </li>
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
      <div ref={endRef} className="scroll-mb-24" />
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
      <span className="sr-only">{`${props.name}: `}</span>
      <LaneLabel row={row} />
      {row.corrected ? (
        <>
          <span aria-hidden className="text-muted-foreground">
            ↶
          </span>
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
        {row.seat === 'A' ? lane : <span />}
        <span className="col-span-3 grid min-h-full grid-cols-subgrid content-center border-x border-divider px-2.5 py-1.5">
          {row.score ? <SpineScore score={row.score} changedSeats={row.changedSeats} /> : null}
          {props.open ? (
            // Out of flow horizontally, so revealed times never widen the spine columns of other rows.
            <span className={cn('relative col-span-3', row.corrected ? 'h-9' : 'h-[18px]')}>
              <span className="absolute left-1/2 grid -translate-x-1/2 justify-items-center text-[14px] leading-[18px] whitespace-nowrap text-amber tabular-nums">
                <time dateTime={row.acceptedAtIso}>{row.acceptedAtLabel}</time>
                {row.corrected ? (
                  <time dateTime={row.corrected.acceptedAtIso}>
                    <span aria-hidden>{`↶ ${row.corrected.acceptedAtLabel}`}</span>
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
      <span aria-hidden className={cn('relative inline-flex gap-1', struck && 'opacity-50')}>
        {row.message.pottedBalls.map((ball) => (
          <StrilaBall key={ball} ball={ball} className="size-5" />
        ))}
        {struck ? <span className="absolute inset-x-0 top-1/2 h-px bg-muted-foreground" /> : null}
      </span>
    </>
  )
}

function SpineScore({ score, changedSeats }: { score: BySeatNumber; changedSeats: readonly Seat[] }) {
  const tone = (seat: Seat) =>
    changedSeats.includes(seat) ? 'font-bold text-foreground' : 'text-muted-foreground'

  return (
    <>
      <ScoreNumber className={cn('text-right text-xl', tone('A'))} points={score.A} />
      <span className="px-0.5 text-xl text-muted-foreground">:</span>
      <ScoreNumber className={cn('text-xl', tone('B'))} points={score.B} />
    </>
  )
}

function FrameResultBand(props: { score: BySeatNumber; caption: readonly string[] }) {
  return (
    <div className="grid justify-items-center gap-0.5 rounded-xl bg-raised px-4 py-3">
      <span className="grid grid-cols-[1fr_auto_1fr] gap-x-2 self-stretch text-2xl font-bold">
        <ScoreNumber className="text-right" points={props.score.A} />
        <span>:</span>
        <ScoreNumber points={props.score.B} />
      </span>
      <span className="text-center text-base text-muted-foreground">{props.caption.join(' · ')}</span>
    </div>
  )
}

function ScoreNumber(props: { points: number; className?: string }): ReactNode {
  return <span className={cn('tabular-nums', props.className)}>{formatProtocolPoints(props.points)}</span>
}

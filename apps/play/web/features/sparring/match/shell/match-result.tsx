import { type BySeatNumber, opponentOf, type Seat } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui'
import { cn } from '@/components/ui/utils'
import { MatchFinishedAt } from '@/features/sparring/match/match-finished-at'
import type { FinishedMatchData } from '@/features/sparring/match/types'

export function MatchResultBoard({ data }: { data: FinishedMatchData }) {
  const { t } = useTranslation()
  const winnerSeat: Seat = data.state.framesWonBySeat.A > data.state.framesWonBySeat.B ? 'A' : 'B'
  const loserSeat = opponentOf(winnerSeat)
  const isLongPyramid = data.state.gameKey === 'free-pyramid-long'

  return (
    <section className="shrink-0 px-4 pt-7 pb-3">
      <Badge variant="live" className="gap-1.5">
        <CheckIcon />
        {t(keys.match.result.winner, { name: data.participants[winnerSeat].displayName })}
      </Badge>

      <div className="mt-5 grid grid-cols-2 gap-x-6">
        {(['A', 'B'] as const).map((seat) => (
          <div
            key={seat}
            className={cn(seat === 'B' && 'text-right', seat === loserSeat && 'text-muted-foreground')}
          >
            <p className="text-[22px] leading-[1.2] font-bold">{data.participants[seat].displayName}</p>
            <p
              className={cn(
                'mt-2 text-[62px] leading-none font-extrabold tracking-[-0.045em] tabular-nums',
                seat === loserSeat && 'font-bold opacity-65',
              )}
            >
              {isLongPyramid ? data.state.frames[0]?.pointsBySeat[seat] : data.state.framesWonBySeat[seat]}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MatchResult({ data }: { data: FinishedMatchData }) {
  const { t } = useTranslation()

  return (
    <section className="px-4 pb-8">
      {data.gameResult?.gameKey === 'free-pyramid-long' ? (
        <ResultScoreList
          title={t(keys.match.result.racks)}
          rows={data.gameResult.racks.map((rack) => ({
            index: rack.rackNumber,
            score: rack.scoreBySeat,
          }))}
        />
      ) : (
        <ResultScoreList
          title={t(keys.match.result.frames)}
          rows={data.state.frames.map((frame) => ({
            index: frame.frameIndex,
            score: frame.pointsBySeat,
          }))}
        />
      )}

      <MatchFinishedAt
        endedAtIso={data.endedAtIso}
        endedAtTime={data.endedAtTime}
        endedAtDate={data.endedAtDate}
        endedAtIsToday={data.endedAtIsToday}
      />
    </section>
  )
}

function ResultScoreList({
  title,
  rows,
}: {
  title: string
  rows: readonly { index: number; score: BySeatNumber }[]
}) {
  return (
    <div className="mt-3 pt-5">
      <h2 className="text-base font-semibold text-muted-foreground">{title}</h2>
      <ol className="mt-2 grid grid-cols-[1fr_auto_auto_auto_1fr] gap-x-2">
        {rows.map(({ index, score }) => (
          <li
            key={index}
            className="col-span-5 grid min-h-12 grid-cols-subgrid items-center border-b border-divider text-xl tabular-nums first:border-t"
          >
            <span className="text-base text-muted-foreground">{index}</span>
            <span
              className={cn(
                'text-right',
                score.A > score.B && 'font-bold',
                score.A < score.B && 'text-muted-foreground',
              )}
            >
              {score.A}
            </span>
            <span className="text-muted-foreground">:</span>
            <span
              className={cn(score.B > score.A && 'font-bold', score.B < score.A && 'text-muted-foreground')}
            >
              {score.B}
            </span>
            <span />
          </li>
        ))}
      </ol>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden className="size-4" viewBox="0 0 16 16" fill="none">
      <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

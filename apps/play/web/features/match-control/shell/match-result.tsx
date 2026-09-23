import { opponentOf, type Seat } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui'
import { cn } from '@/components/ui/utils'
import { MatchFinishedAt } from '@/features/match-control/match-finished-at'

import type { FinishedMatchData } from './types'

export function MatchResult({ data }: { data: FinishedMatchData }) {
  const { t } = useTranslation()
  const winnerSeat: Seat = data.state.framesWonBySeat.A > data.state.framesWonBySeat.B ? 'A' : 'B'
  const loserSeat = opponentOf(winnerSeat)

  return (
    <section className="px-4 pt-7 pb-8">
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
              {data.state.framesWonBySeat[seat]}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-5">
        <h2 className="text-base font-semibold text-muted-foreground">{t(keys.match.result.frames)}</h2>
        <ol className="mt-2">
          {data.state.frames.map((frame) => (
            <li
              key={frame.frameIndex}
              className="grid min-h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-divider first:border-t"
            >
              <span className="text-muted-foreground tabular-nums">{frame.frameIndex}</span>
              <span className="flex items-baseline gap-2 text-xl tabular-nums">
                <FramePoints value={frame.pointsBySeat.A} winner={frame.winnerSeat === 'A'} />
                <span className="text-muted-foreground">:</span>
                <FramePoints value={frame.pointsBySeat.B} winner={frame.winnerSeat === 'B'} />
              </span>
              <span />
            </li>
          ))}
        </ol>
      </div>

      <MatchFinishedAt endedAt={data.endedAt} endedAtIsToday={data.endedAtIsToday} />
    </section>
  )
}

function FramePoints({ value, winner }: { value: number; winner: boolean }) {
  return <span className={cn(winner ? 'font-bold text-foreground' : 'text-muted-foreground')}>{value}</span>
}

function CheckIcon() {
  return (
    <svg aria-hidden className="size-4" viewBox="0 0 16 16" fill="none">
      <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

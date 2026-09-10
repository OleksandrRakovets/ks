import type { BySeatNumber } from '@ks/core'
import { keys } from '@ks/i18n'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/components/ui/v2/utils'

type Props = {
  nameA: string
  nameB: string
  matchStatus: 'active' | 'finished'
  targetFrames: number
  matchScore: BySeatNumber
  frameScore: BySeatNumber
  frameIndex: number
  pottedBallCounts?: BySeatNumber
  scoreMarkers?: { A: ReactNode; B: ReactNode }
  statusLine?: string
  alwaysShowFrameScore?: boolean
}

export function ScoreBox({
  nameA,
  nameB,
  matchStatus,
  matchScore,
  frameScore,
  frameIndex,
  targetFrames,
  pottedBallCounts,
  scoreMarkers,
  statusLine,
  alwaysShowFrameScore,
}: Props) {
  const { t } = useTranslation()
  const isLive = matchStatus === 'active'
  const numberA = isLive || alwaysShowFrameScore ? frameScore.A : matchScore.A
  const numberB = isLive || alwaysShowFrameScore ? frameScore.B : matchScore.B
  const isAWinner = !isLive && numberA > numberB
  const isBWinner = !isLive && numberB > numberA

  return (
    <div className="sticky top-12 z-10 border-b border-divider bg-surface lg:top-14">
      <div className="grid grid-cols-2 gap-x-4 px-4 py-3 text-lg leading-tight font-semibold lg:py-2">
        <span className="line-clamp-2 min-w-0">{nameA}</span>
        <span className="line-clamp-2 min-w-0 text-right">{nameB}</span>
      </div>

      <div className="flex items-center gap-x-5 border-b border-divider py-2 text-base text-muted-foreground">
        {statusLine ? (
          <span className="flex-1 text-center">{statusLine}</span>
        ) : (
          <>
            <span className={cn('flex-1 text-right', { hidden: !isLive })}>
              {t(keys.match.scoreboard.frameWithNumber, { frameIndex })}
            </span>

            <div
              className={cn('grid w-18 grid-cols-[1fr_auto_1fr] items-center text-foreground', {
                hidden: !isLive,
              })}
            >
              <span className="text-right text-2xl font-semibold tracking-tight tabular-nums">
                {matchScore.A}
              </span>
              <span className="mx-1 text-xl font-extralight tracking-tight">:</span>
              <span className="text-left text-2xl font-semibold tracking-tight tabular-nums">
                {matchScore.B}
              </span>
            </div>

            <span className={cn('flex-1', { 'text-left': isLive, 'text-center': !isLive })}>
              {t(keys.match.scoreboard.raceToWins, { targetFrames })}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-4 py-3">
        {scoreMarkers?.A ??
          (pottedBallCounts ? <PottedBalls count={pottedBallCounts.A} align="right" /> : <span />)}
        <div className={cn('grid w-52 grid-cols-[1fr_auto_1fr] items-center', { 'text-amber': isLive })}>
          <span
            className={cn('text-right text-7xl font-bold tracking-tight tabular-nums', {
              'text-primary': isAWinner,
            })}
          >
            {numberA}
          </span>
          <span className="mx-2 text-4xl font-extralight tracking-tight">:</span>
          <span
            className={cn('text-left text-7xl font-bold tracking-tight tabular-nums', {
              'text-primary': isBWinner,
            })}
          >
            {numberB}
          </span>
        </div>
        {scoreMarkers?.B ??
          (pottedBallCounts ? <PottedBalls count={pottedBallCounts.B} align="left" /> : <span />)}
      </div>
    </div>
  )
}

function PottedBalls(props: { count: number; align: 'left' | 'right' }) {
  return (
    <div
      className={cn('flex min-w-0 flex-wrap gap-1.5', {
        'justify-end': props.align === 'right',
        'justify-start': props.align === 'left',
      })}
    >
      {Array.from({ length: props.count }, (_, index) => (
        <span key={index} aria-hidden className="size-3.5 shrink-0 rounded-full bg-neutral-100" />
      ))}
    </div>
  )
}

import type { BySeatNumber } from '@ks/core'
import { keys } from '@ks/i18n'
import cn from 'classnames'
import { useTranslation } from 'react-i18next'

type Props = {
  nameA: string
  nameB: string
  matchStatus: 'active' | 'finished'
  targetFrames: number
  matchScore: BySeatNumber
  frameScore: BySeatNumber
  frameIndex: number
}

export function ScoreBox({ nameA, nameB, matchStatus, matchScore, frameScore, frameIndex, targetFrames }: Props) {
  const { t } = useTranslation()
  const isLive = matchStatus === 'active'
  const numberA = isLive ? frameScore.A : matchScore.A
  const numberB = isLive ? frameScore.B : matchScore.B
  const isAWinner = !isLive && numberA > numberB
  const isBWinner = !isLive && numberB > numberA

  return (
    <div className="sticky top-14 z-10 border-b border-divider bg-background">
      <div className={cn('flex items-center gap-x-5 border-b border-divider py-2 text-base text-text-lo', {})}>
        <span className={cn('flex-1 text-right', { hidden: !isLive })}>
          {t(keys.match.scoreboard.frameWithNumber, { frameIndex })}
        </span>

        <div className={cn('flex items-center text-text-hi', { hidden: !isLive })}>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{matchScore.A}</span>
          <span className="mx-1 text-xl font-extralight tracking-tight">:</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{matchScore.B}</span>
        </div>

        <span className={cn('flex-1', { 'text-left': isLive, 'text-center': !isLive })}>
          {t(keys.match.scoreboard.raceToWins, { targetFrames })}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-4 py-3">
        <span className={cn('line-clamp-2 min-w-0 text-lg leading-tight font-semibold', { 'text-primary': isAWinner })}>
          {nameA}
        </span>
        <div className={cn('flex items-center', { 'text-amber': isLive })}>
          <span className={cn('text-center text-7xl font-bold tracking-tight tabular-nums', { 'text-primary': isAWinner })}>
            {numberA}
          </span>
          <span className="mx-2 text-4xl font-extralight tracking-tight">:</span>
          <span className={cn('text-7xl font-bold tracking-tight tabular-nums', { 'text-primary': isBWinner })}>{numberB}</span>
        </div>
        <span
          className={cn('line-clamp-2 min-w-0 text-right text-lg leading-tight font-semibold', { 'text-primary': isBWinner })}
        >
          {nameB}
        </span>
      </div>
    </div>
  )
}

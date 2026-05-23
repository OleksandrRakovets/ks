import type { BySeatNumber } from '@ks/core'
import cn from 'classnames'

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
  const isLive = matchStatus === 'active'
  const numberA = isLive ? frameScore.A : matchScore.A
  const numberB = isLive ? frameScore.B : matchScore.B
  const isAWinner = !isLive && numberA > numberB
  const isBWinner = !isLive && numberB > numberA

  return (
    <div className="sticky top-11 z-10 border-b border-divider bg-background">
      <div className={cn('flex items-center gap-x-5 border-b border-divider py-1 text-sm text-text-lo', {})}>
        <span className={cn('flex-1 text-right', { hidden: !isLive })}>Партія {frameIndex}</span>

        <div className={cn('flex items-center text-text-hi', { hidden: !isLive })}>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{matchScore.A}</span>
          <span className="mx-1 text-xl font-extralight tracking-tight">:</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{matchScore.B}</span>
        </div>

        <span className={cn('flex-1', { 'text-left': isLive, 'text-center': !isLive })}>до {targetFrames} перемог</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-4 py-3">
        <span className={cn('line-clamp-2 font-semibold', { 'text-primary': isAWinner })}>{nameA}</span>
        <div className={cn('flex items-center', { 'text-amber': isLive })}>
          <span className={cn('text-center text-7xl font-bold tracking-tight tabular-nums', { 'text-primary': isAWinner })}>
            {numberA}
          </span>
          <span className="mx-2 text-4xl font-extralight tracking-tight">:</span>
          <span className={cn('text-7xl font-bold tracking-tight tabular-nums', { 'text-primary': isBWinner })}>{numberB}</span>
        </div>
        <span className={cn('line-clamp-2 text-right font-semibold', { 'text-primary': isBWinner })}>{nameB}</span>
      </div>
    </div>
  )
}

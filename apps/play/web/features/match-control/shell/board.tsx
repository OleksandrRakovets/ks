import type { BySeatNumber } from '@ks/core'
import type { RegisteredGameKey, StrilaBall } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { cn } from '@/components/ui/utils'

import { STRILA_BALL_COLORS } from '../strila-balls'
import type { MatchControlData } from './types'

export function Board<K extends RegisteredGameKey>({ data }: { data: MatchControlData<K> }) {
  const { t } = useTranslation()

  const frameScore =
    data.controlState === 'frame-active'
      ? data.game.score
      : data.state.currentFrameIndex > 0
        ? data.state.frames[data.state.currentFrameIndex - 1].pointsBySeat
        : { A: 0, B: 0 }

  const largeScore = scoreNeedsStepDown(frameScore, data.state.targets.frameTargetPointsBySeat)

  return (
    <section
      className="shrink-0 bg-background px-4 pt-1 pb-4 [@media(min-height:740px)]:pt-3 [@media(min-height:740px)]:pb-5 [@media(min-height:820px)]:pt-4 [@media(min-height:820px)]:pb-6"
      aria-label={t(keys.match.control.perGameContainer)}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] items-end gap-x-2 gap-y-2">
        <PlayerName>{data.participants.A.displayName}</PlayerName>
        <span />
        <PlayerName align="right">{data.participants.B.displayName}</PlayerName>

        <Score
          align="left"
          value={frameScore.A}
          target={data.state.targets.frameTargetPointsBySeat.A}
          stepDown={largeScore}
        />
        <FrameScore visible={data.state.targets.matchTargetFrames > 1} score={data.state.framesWonBySeat} />
        <Score
          align="right"
          value={frameScore.B}
          target={data.state.targets.frameTargetPointsBySeat.B}
          stepDown={largeScore}
        />
      </div>

      {data.controlState === 'frame-active' && data.game.gameKey === 'strila-v2' ? (
        <div className="mt-1 grid grid-cols-2 gap-4">
          <StrilaReconciliation balls={data.game.details.pottedBallsBySeat.A} align="left" />
          <StrilaReconciliation balls={data.game.details.pottedBallsBySeat.B} align="right" />
        </div>
      ) : null}

      {data.controlState === 'frame-active' && data.game.gameKey === 'free-pyramid-long' ? (
        <>
          <div className="mt-1 grid grid-cols-2 gap-4">
            <RackReconciliation count={data.game.details.currentRack.scoreBySeat.A} align="left" />
            <RackReconciliation count={data.game.details.currentRack.scoreBySeat.B} align="right" />
          </div>
          <p className="text-text-lo mt-3 text-center text-base">
            {t(keys.match.control.longFreePyramid.ballsOnTable, {
              count: data.game.details.ballsOnTable,
            })}
          </p>
        </>
      ) : null}
    </section>
  )
}

function PlayerName({ children, align = 'left' }: { children: string; align?: 'left' | 'right' }) {
  return (
    <span className={cn('min-w-0 text-lg leading-[1.22] font-semibold', align === 'right' && 'text-right')}>
      {children}
    </span>
  )
}

function Score(props: { align: 'left' | 'right'; value: number; target: number; stepDown: boolean }) {
  const number = (
    <strong
      className={cn(
        'font-extrabold tracking-[-0.045em] text-[var(--bone)] tabular-nums',
        props.stepDown ? 'text-[56px]' : 'text-[66px]',
        'leading-none',
      )}
    >
      {props.value}
    </strong>
  )

  const target = <span className="pb-1 text-xl font-medium text-[var(--t-muted)]">/{props.target}</span>

  return (
    <span
      className={cn('flex min-w-0 items-end gap-1', props.align === 'right' ? 'justify-end' : 'justify-start')}
    >
      {props.align === 'right' ? target : number}
      {props.align === 'right' ? number : target}
    </span>
  )
}

function FrameScore({ visible, score }: { visible: boolean; score: BySeatNumber }) {
  const { t } = useTranslation()

  if (!visible) return <span />

  return (
    <span className="grid place-items-center self-center text-center">
      <strong className="text-[22px] leading-none font-bold tabular-nums">{`${score.A}:${score.B}`}</strong>
      <span className="text-text-lo mt-1 text-[14px] leading-none">{t(keys.match.control.frames)}</span>
    </span>
  )
}

function StrilaReconciliation(props: { balls: readonly StrilaBall[]; align: 'left' | 'right' }) {
  return (
    <div className={cn('flex flex-wrap gap-1', props.align === 'right' && 'justify-end')}>
      {props.balls.map((ball, index) => (
        <span
          key={`${ball}-${index}`}
          aria-hidden
          className="size-[13px] shrink-0 rounded-full shadow-[var(--ball-shadow)]"
          style={{ backgroundColor: STRILA_BALL_COLORS[ball].background }}
        />
      ))}
    </div>
  )
}

function RackReconciliation({ count, align }: { count: number; align: 'left' | 'right' }) {
  const groups = Array.from({ length: Math.ceil(count / 5) }, (_, groupIndex) =>
    Array.from({ length: Math.min(5, count - groupIndex * 5) }),
  )

  return (
    <div className={cn('flex flex-wrap gap-[11px]', align === 'right' && 'justify-end')}>
      {groups.map((group, groupIndex) => (
        <span key={groupIndex} className="flex gap-1">
          {group.map((_, ballIndex) => (
            <span
              key={ballIndex}
              aria-hidden
              className="size-[13px] shrink-0 rounded-full bg-[#F2EDE1] shadow-[var(--ball-shadow)]"
            />
          ))}
        </span>
      ))}
    </div>
  )
}

function scoreNeedsStepDown(score: BySeatNumber, target: BySeatNumber): boolean {
  return [score.A, score.B, target.A, target.B].some((value) => String(Math.abs(value)).length >= 3)
}

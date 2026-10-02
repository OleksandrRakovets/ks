import type { BySeatNumber } from '@ks/core'
import type { StrilaBall } from '@ks/gameplay/definitions'

import { StrilaBall as StrilaBallVisual } from '@/components/strila-ball'
import { Badge } from '@/components/ui'
import { cn } from '@/components/ui/utils'

import type { BoardPresentation } from './presentation'

export function Board({ presentation }: { presentation: BoardPresentation }) {
  const { primary, targets, framesWon, compactScore } = presentation.score

  return (
    <section
      className="shrink-0 bg-background px-4 pt-1 pb-3.5 [@media(min-height:740px)]:pt-3 [@media(min-height:740px)]:pb-5 [@media(min-height:820px)]:pt-4 [@media(min-height:820px)]:pb-6"
      aria-label={presentation.label}
    >
      {presentation.winnerLabel !== undefined ? (
        <div className="mb-5">
          <Badge variant="live" className="gap-1.5">
            <CheckIcon />
            {presentation.winnerLabel}
          </Badge>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] items-end gap-x-2 gap-y-2">
        <PlayerName muted={presentation.mutedSeat === 'A'}>{presentation.names.A}</PlayerName>
        <span />
        <PlayerName align="right" muted={presentation.mutedSeat === 'B'}>
          {presentation.names.B}
        </PlayerName>

        <Score
          align="left"
          value={primary.A}
          target={targets.A}
          compact={compactScore}
          muted={presentation.mutedSeat === 'A'}
        />
        <FrameScore score={framesWon} label={presentation.framesLabel} />
        <Score
          align="right"
          value={primary.B}
          target={targets.B}
          compact={compactScore}
          muted={presentation.mutedSeat === 'B'}
        />
      </div>

      {presentation.details?.kind === 'balls' ? (
        <div className="mt-1 grid grid-cols-2 gap-4">
          <StrilaReconciliation balls={presentation.details.ballsBySeat.A} align="left" />
          <StrilaReconciliation balls={presentation.details.ballsBySeat.B} align="right" />
        </div>
      ) : null}

      {presentation.details?.kind === 'rack' ? (
        <>
          <div className="mt-1 grid grid-cols-2 gap-4">
            <RackReconciliation count={presentation.details.scoreBySeat.A} align="left" />
            <RackReconciliation count={presentation.details.scoreBySeat.B} align="right" />
          </div>
          <p className="mt-3 text-center text-base text-muted-foreground">{presentation.details.tableLabel}</p>
        </>
      ) : null}
    </section>
  )
}

function PlayerName({
  children,
  align = 'left',
  muted,
}: {
  children: string
  align?: 'left' | 'right'
  muted: boolean
}) {
  return (
    <span
      className={cn(
        'w-min min-w-0 text-lg leading-[1.22] font-semibold',
        align === 'right' && 'justify-self-end text-right',
        muted && 'text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

function Score(props: {
  align: 'left' | 'right'
  value: number
  target: number | undefined
  compact: boolean
  muted: boolean
}) {
  const number = (
    <strong
      className={cn(
        'font-extrabold tracking-[-0.045em] text-[var(--bone)] tabular-nums',
        props.compact ? 'text-[56px]' : 'text-[66px]',
        'leading-none',
        props.muted && 'font-bold text-muted-foreground opacity-65',
      )}
    >
      {props.value}
    </strong>
  )

  const target =
    props.target !== undefined ? (
      <span className="pb-1 text-xl font-medium text-muted-foreground">
        {props.align === 'right' ? `${props.target}/` : `/${props.target}`}
      </span>
    ) : null

  return (
    <span
      className={cn('flex min-w-0 items-end gap-1', props.align === 'right' ? 'justify-end' : 'justify-start')}
    >
      {props.align === 'right' ? target : number}
      {props.align === 'right' ? number : target}
    </span>
  )
}

function FrameScore({ score, label }: { score: typeof BySeatNumber.Type | undefined; label: string }) {
  if (!score) return <span />

  return (
    <span className="grid place-items-center self-center text-center">
      <strong className="text-[22px] leading-none font-bold tabular-nums">{`${score.A}:${score.B}`}</strong>
      <span className="mt-1 text-[14px] leading-none text-muted-foreground">{label}</span>
    </span>
  )
}

function StrilaReconciliation(props: { balls: readonly (typeof StrilaBall.Type)[]; align: 'left' | 'right' }) {
  return (
    <div className={cn('grid w-fit grid-cols-[repeat(8,13px)] gap-1', props.align === 'right' && 'ml-auto')}>
      {props.balls.map((ball, index) => (
        <StrilaBallVisual key={`${ball}-${index}`} ball={ball} className="size-[13px]" />
      ))}
    </div>
  )
}

function RackReconciliation({ count, align }: { count: number; align: 'left' | 'right' }) {
  return (
    <div className={cn('grid w-fit grid-cols-[repeat(4,13px)] gap-1', align === 'right' && 'ml-auto')}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className="size-[13px] rounded-full bg-[#F2EDE1] shadow-[var(--ball-shadow)]"
        />
      ))}
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

import type { StrilaBall as StrilaBallValue } from '@ks/gameplay/definitions'

import { cn } from '@/components/ui/utils'

/** Visual identity shared by every representation of a physical Strila ball. */
export function StrilaBall(props: { ball: StrilaBallValue; selected?: boolean; className?: string }) {
  const colors = STRILA_BALL_PALETTE[props.ball]

  return (
    <span
      aria-hidden
      className={cn('block shrink-0 rounded-full shadow-[var(--ball-shadow)]', props.className)}
      style={{
        backgroundColor: colors.base,
        backgroundImage: [
          'radial-gradient(circle at 34% 27%, rgb(255 255 255 / 0.78) 0 4%, rgb(255 255 255 / 0.22) 5%, transparent 17%)',
          `radial-gradient(circle at 42% 38%, ${colors.highlight} 0%, ${colors.base} 54%, ${colors.shade} 100%)`,
        ].join(', '),
        boxShadow:
          props.selected === true
            ? '0 0 0 2px var(--c-raised), 0 0 0 5px var(--a-amber), var(--ball-shadow)'
            : undefined,
      }}
    />
  )
}

/** Ball colours shared by the in-app balls and the self-contained scoreboard artwork. */
export const STRILA_BALL_PALETTE = {
  0: { highlight: '#FFFDF7', base: '#F0E8D8', shade: '#C9B995' },
  1: { highlight: '#F44A59', base: '#D51F36', shade: '#8F0D21' },
  2: { highlight: '#FFC557', base: '#EFA51B', shade: '#A85B06' },
  3: { highlight: '#2BA274', base: '#087A4D', shade: '#03452E' },
  4: { highlight: '#A94B55', base: '#7A2937', shade: '#47131D' },
  5: { highlight: '#377DB3', base: '#14598F', shade: '#072C52' },
  6: { highlight: '#F58A98', base: '#E85F75', shade: '#A52B43' },
  7: { highlight: '#59605D', base: '#292E2C', shade: '#101412' },
} satisfies Record<StrilaBallValue, { highlight: string; base: string; shade: string }>

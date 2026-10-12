import type { Seat } from '@ks/core'
import type { ReactNode } from 'react'

import { cn } from '@/components/ui/utils'
import type { PresentedControl } from '@/features/sparring/match/renderers/control-presentation'

export type ZonePresentation = Record<Seat, { items: readonly PresentedControl[]; compact: boolean }>

export function ControlZones(props: {
  selector?: ReactNode
  primary: ZonePresentation | null
  secondary: ZonePresentation | null
}) {
  return (
    <section className="shrink-0 bg-raised py-3.5 [@media(min-height:740px)]:py-4 [@media(min-height:820px)]:py-5">
      {props.selector}
      {props.primary ? <Zone kind="primary" lanes={props.primary} /> : null}
      {props.secondary ? (
        <div
          className={cn(
            props.primary && 'pt-3.5 [@media(min-height:740px)]:pt-4 [@media(min-height:820px)]:pt-5',
          )}
        >
          <Zone kind="secondary" lanes={props.secondary} />
        </div>
      ) : null}
    </section>
  )
}

function Zone(props: { kind: 'primary' | 'secondary'; lanes: ZonePresentation }) {
  return (
    <div className="grid grid-cols-[1fr_1px_1fr] px-3">
      <Lane kind={props.kind} seat="A" presentation={props.lanes.A} />
      <div aria-hidden className="bg-divider" />
      <Lane kind={props.kind} seat="B" presentation={props.lanes.B} />
    </div>
  )
}

function Lane(props: { kind: 'primary' | 'secondary'; seat: Seat; presentation: ZonePresentation['A'] }) {
  const { items, compact } = props.presentation

  return (
    <div
      className={cn(
        'grid content-stretch gap-x-2 gap-y-3.5 [@media(min-height:740px)]:gap-y-4 [@media(min-height:820px)]:gap-y-5',
        compact && 'grid-cols-2',
        props.seat === 'A' ? 'pr-3' : 'pl-3',
      )}
    >
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          disabled={item.disabled}
          aria-label={item.accessibleLabel}
          className={cn(
            'min-w-0 rounded-lg px-2 py-2 text-lg leading-tight font-semibold whitespace-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            props.kind === 'primary'
              ? 'min-h-[60px] bg-action text-action-foreground'
              : 'min-h-[50px] bg-overlay text-foreground',
            props.kind === 'secondary' && item.destructive && 'text-destructive',
            item.unavailable ? 'opacity-45' : 'disabled:opacity-100',
            compact && index === 0 && items.length % 2 === 1 && 'col-span-2',
          )}
          onClick={item.onSelect}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

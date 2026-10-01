import type { ReactNode } from 'react'

import type { PresentedControl } from '../renderers/control-presentation'

export function Takeover(props: {
  title?: ReactNode
  note?: ReactNode
  controls: readonly PresentedControl[]
}) {
  return (
    <section className="grid gap-2 bg-raised px-3 py-2 [@media(min-height:740px)]:gap-3 [@media(min-height:740px)]:py-4 [@media(min-height:820px)]:py-5">
      {props.title !== undefined && props.title !== null ? (
        <div className="px-1 text-[17px] leading-snug font-semibold">{props.title}</div>
      ) : null}
      {props.note}
      <div className="grid gap-y-2 [@media(min-height:740px)]:gap-y-4 [@media(min-height:820px)]:gap-y-5">
        {props.controls.map((control) => (
          <button
            key={control.key}
            type="button"
            disabled={control.disabled}
            aria-label={control.accessibleLabel}
            className="grid min-h-14 place-content-center rounded-lg border border-divider bg-overlay px-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-45 [@media(min-height:740px)]:min-h-[62px]"
            onClick={control.onSelect}
          >
            <span className="text-lg font-semibold">{control.label}</span>
            {control.effect !== undefined && control.effect.length > 0 ? (
              <span className="text-[14px] text-muted-foreground">{control.effect}</span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  )
}

export function TakeoverContainer({ children }: { children: ReactNode }) {
  return <div className="shrink-0 bg-raised">{children}</div>
}

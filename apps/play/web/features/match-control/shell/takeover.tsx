import type { Control, MatchCommand } from '@ks/core'
import type { ReactNode } from 'react'

import { matchCommandFromControl } from '../renderers/types'
import type { ControlPresentation } from './action-stack'

export function Takeover(props: {
  title?: ReactNode
  note?: ReactNode
  controls: readonly Control[]
  renderControl: (control: Control, index: number) => ControlPresentation
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  return (
    <section className="grid gap-3 bg-raised px-3 py-3.5 [@media(min-height:740px)]:py-4 [@media(min-height:820px)]:py-5">
      {props.title !== undefined && props.title !== null ? (
        <div className="px-1 text-[17px] leading-snug font-semibold">{props.title}</div>
      ) : null}
      {props.note}
      <div className="grid gap-y-3.5 [@media(min-height:740px)]:gap-y-4 [@media(min-height:820px)]:gap-y-5">
        {props.controls.map((control, index) => {
          const presentation = props.renderControl(control, index)

          return (
            <button
              key={`${control.source}-${control.type}-${index}`}
              type="button"
              disabled={props.submitting || presentation.disabled}
              aria-label={presentation.accessibleLabel}
              className="grid min-h-[62px] place-content-center rounded-lg border border-divider bg-overlay px-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-45"
              onClick={() =>
                props.onSubmit(presentation.command ?? matchCommandFromControl(control, presentation.input))
              }
            >
              <span className="text-lg font-semibold">{presentation.label}</span>
              {presentation.effect !== undefined && presentation.effect.length > 0 ? (
                <span className="text-[14px] text-muted-foreground">{presentation.effect}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

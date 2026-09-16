import type { Control, ControlSections, MatchCommand } from '@ks/core'
import type { ReactNode } from 'react'

import { cn } from '@/components/ui/utils'

import { matchCommandFromControl } from '../renderers/types'
import { Takeover } from './takeover'

export type ControlPresentation = {
  label: ReactNode
  visibleLabel: string
  accessibleLabel?: string
  effect?: string
  disabled?: boolean
  input?: Control['fixedInput']
  command?: MatchCommand
}

export function ActionStack(props: {
  sections: ControlSections
  selector?: ReactNode
  takeover?: ReactNode
  renderControl: (control: Control, index: number) => ControlPresentation
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  if (props.takeover !== undefined && props.takeover !== null)
    return <div className="shrink-0 bg-raised">{props.takeover}</div>

  if (props.sections.neutral.length > 0) {
    return (
      <div className="shrink-0 bg-raised">
        <Takeover
          controls={props.sections.neutral}
          renderControl={props.renderControl}
          submitting={props.submitting}
          onSubmit={props.onSubmit}
        />
      </div>
    )
  }

  const hasPrimary = hasControls(props.sections.primary)
  const hasSecondary = hasControls(props.sections.secondary)

  return (
    <section className="shrink-0 bg-raised py-3.5 [@media(min-height:740px)]:py-4 [@media(min-height:820px)]:py-5">
      {props.selector}
      {hasPrimary ? (
        <Zone
          kind="primary"
          controls={props.sections.primary}
          renderControl={props.renderControl}
          submitting={props.submitting}
          onSubmit={props.onSubmit}
        />
      ) : null}
      {hasSecondary ? (
        <div
          className={cn(
            hasPrimary && 'pt-3.5 [@media(min-height:740px)]:pt-4 [@media(min-height:820px)]:pt-5',
          )}
        >
          <Zone
            kind="secondary"
            controls={props.sections.secondary}
            renderControl={props.renderControl}
            submitting={props.submitting}
            onSubmit={props.onSubmit}
          />
        </div>
      ) : null}
    </section>
  )
}

export function Zone(props: {
  kind: 'primary' | 'secondary'
  controls: ControlSections['primary']
  renderControl: (control: Control, index: number) => ControlPresentation
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_1px_1fr] px-3">
      <Lane {...props} seat="A" />
      <div aria-hidden className="bg-divider" />
      <Lane {...props} seat="B" />
    </div>
  )
}

function Lane(
  props: Parameters<typeof Zone>[0] & {
    seat: 'A' | 'B'
  },
) {
  const presentations = props.controls[props.seat].map((control, index) => ({
    control,
    presentation: props.renderControl(control, index),
    index,
  }))

  const compact =
    presentations.length > 1 &&
    presentations.every(({ presentation }) => presentation.visibleLabel.length <= 3)

  return (
    <div
      className={cn(
        'grid content-stretch gap-x-2 gap-y-3.5 [@media(min-height:740px)]:gap-y-4 [@media(min-height:820px)]:gap-y-5',
        compact && 'grid-cols-2',
        props.seat === 'A' ? 'pr-3' : 'pl-3',
      )}
    >
      {presentations.map(({ control, presentation, index }, itemIndex) => (
        <button
          key={`${control.source}-${control.type}-${index}`}
          type="button"
          disabled={props.submitting || presentation.disabled}
          aria-label={presentation.accessibleLabel}
          className={cn(
            'min-w-0 rounded-lg px-2 py-2 text-lg leading-tight font-semibold whitespace-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-45',
            props.kind === 'primary'
              ? 'min-h-[60px] bg-green text-[#07140D]'
              : 'min-h-[50px] bg-overlay text-foreground',
            props.kind === 'secondary' && control.type === 'foul.commit' && 'text-red',
            compact &&
              itemIndex === presentations.length - 1 &&
              presentations.length % 2 === 1 &&
              'col-span-2',
          )}
          onClick={() =>
            props.onSubmit(presentation.command ?? matchCommandFromControl(control, presentation.input))
          }
        >
          {presentation.label}
        </button>
      ))}
    </div>
  )
}

function hasControls(controls: ControlSections['primary']): boolean {
  return controls.A.length > 0 || controls.B.length > 0
}

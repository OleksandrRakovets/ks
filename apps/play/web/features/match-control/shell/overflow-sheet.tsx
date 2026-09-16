import type { Control, ControlSections, MatchCommand } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui'

import { controlLabel } from '../renderers/control-copy'
import { matchCommandFromControl } from '../renderers/types'

export function OverflowSheet(props: {
  controls: ControlSections['tertiary']
  names: { A: string; B: string }
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  const { t } = useTranslation()
  const hasControls = props.controls.A.length > 0 || props.controls.B.length > 0

  if (!hasControls) return <span className="size-11" />

  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            className="grid size-11 place-items-center rounded-lg text-2xl leading-none outline-none hover:bg-overlay focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={t(keys.match.control.otherActions)}
          />
        }
      >
        <EllipsisIcon />
      </SheetTrigger>
      <SheetContent className="inset-x-0 top-auto bottom-0 mx-auto h-auto max-h-[calc(100dvh-1rem)] w-full max-w-match rounded-t-[20px] border-0 bg-raised pb-[max(18px,env(safe-area-inset-bottom))] data-ending-style:translate-x-0 data-ending-style:translate-y-8 data-starting-style:translate-x-0 data-starting-style:translate-y-8">
        <div aria-hidden className="mx-auto mt-2 h-1 w-12 rounded-full bg-[var(--t-muted)]" />
        <SheetHeader className="flex-row items-center justify-between border-0 px-4 pt-4 pb-2">
          <SheetTitle className="text-[19px]">{t(keys.match.control.otherActions)}</SheetTitle>
          <SheetClose
            className="grid size-11 place-items-center rounded-lg text-2xl outline-none hover:bg-overlay focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={t(keys.nav.close)}
          >
            <CloseIcon />
          </SheetClose>
        </SheetHeader>
        <div className="grid gap-4 overflow-y-auto px-4 pt-1">
          {(['A', 'B'] as const).map((seat) =>
            props.controls[seat].length > 0 ? (
              <section key={seat} className="grid gap-2">
                <h2 className="text-text-lo text-base font-semibold">{props.names[seat]}</h2>
                {props.controls[seat].map((control, index) => (
                  <OverflowControl
                    key={`${control.type}-${index}`}
                    control={control}
                    submitting={props.submitting}
                    onSubmit={props.onSubmit}
                  />
                ))}
              </section>
            ) : null,
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function EllipsisIcon() {
  return (
    <svg aria-hidden className="text-text-lo size-5" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h.01M10 10h.01M16 10h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden className="size-5" viewBox="0 0 20 20" fill="none">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function OverflowControl(props: {
  control: Control
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  const { t } = useTranslation()
  const label = controlLabel(t, props.control)

  return (
    <SheetClose
      render={
        <button
          type="button"
          disabled={props.submitting}
          aria-label={label}
          className="min-h-14 rounded-lg bg-overlay px-4 text-left text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-45"
          onClick={() => props.onSubmit(matchCommandFromControl(props.control))}
        />
      }
    >
      {label}
    </SheetClose>
  )
}

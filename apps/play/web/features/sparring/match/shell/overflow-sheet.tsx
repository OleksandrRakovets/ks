import type { Control, ControlSections, MatchCommand } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { ResponsiveMenu } from '@/components/ui'
import { controlLabel } from '@/features/sparring/match/renderers/control-copy'
import { matchCommandFromControl } from '@/features/sparring/match/renderers/types'

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
    <ResponsiveMenu
      title={t(keys.match.control.otherActions)}
      closeLabel={t(keys.nav.close)}
      trigger={
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg text-2xl leading-none outline-none hover:bg-overlay focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label={t(keys.match.control.otherActions)}
        >
          <EllipsisIcon />
        </button>
      }
    >
      {({ close }) => (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-1 pb-5 md:pt-4">
          <h2 className="mb-3 text-[19px] font-semibold md:pr-12">{t(keys.match.control.otherActions)}</h2>
          <div className="grid gap-4">
            {(['A', 'B'] as const).map((seat) =>
              props.controls[seat].length > 0 ? (
                <section key={seat} className="grid gap-2">
                  <h2 className="text-base font-semibold text-muted-foreground">{props.names[seat]}</h2>
                  {props.controls[seat].map((control, index) => (
                    <OverflowControl
                      key={`${control.type}-${index}`}
                      control={control}
                      submitting={props.submitting}
                      onSubmit={props.onSubmit}
                      close={close}
                    />
                  ))}
                </section>
              ) : null,
            )}
          </div>
        </div>
      )}
    </ResponsiveMenu>
  )
}

function EllipsisIcon() {
  return (
    <svg aria-hidden className="size-5 text-muted-foreground" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h.01M10 10h.01M16 10h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function OverflowControl(props: {
  control: Control
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
  close: () => void
}) {
  const { t } = useTranslation()
  const label = controlLabel(t, props.control)

  return (
    <button
      type="button"
      disabled={props.submitting}
      aria-label={label}
      className="min-h-14 rounded-lg bg-overlay px-4 text-left text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-45"
      onClick={() => {
        props.onSubmit(matchCommandFromControl(props.control))
        props.close()
      }}
    >
      {label}
    </button>
  )
}

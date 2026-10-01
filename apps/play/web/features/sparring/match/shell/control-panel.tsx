import type { ReactNode } from 'react'

export function ControlPanel(props: { errorLabel?: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-end">
      {props.errorLabel !== undefined && props.errorLabel.length > 0 ? (
        <p
          role="alert"
          className="mx-3 mb-2 rounded-lg bg-destructive-dim px-3 py-2 text-base text-destructive"
        >
          {props.errorLabel}
        </p>
      ) : null}
      {props.children}
    </div>
  )
}

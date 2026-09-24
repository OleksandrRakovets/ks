import type { ProtocolRow } from '@ks/application'
import { useTranslation } from 'react-i18next'

import { protocolRowLabel } from './protocol-copy'

export function ProtocolPanel(props: { rows: readonly ProtocolRow[]; emptyLabel: string }) {
  const { t } = useTranslation()

  if (props.rows.length === 0) return <p className="text-base text-muted-foreground">{props.emptyLabel}</p>

  return (
    <div className="grid gap-2">
      {props.rows.map((row) => (
        <article
          key={row.key}
          className="flex items-baseline justify-between gap-3 border-b border-divider pb-2 text-base"
        >
          <span className="flex min-w-0 flex-col">
            <span className="min-w-0">
              {row.message.actor !== undefined && row.message.actor.length > 0 ? (
                <strong className="font-semibold">{row.message.actor} </strong>
              ) : null}
              {protocolRowLabel(t, row)}
            </span>
            {row.score ? (
              <span className="text-[14px] text-muted-foreground">{`${row.score.A}:${row.score.B}`}</span>
            ) : null}
          </span>
          <time
            className="shrink-0 text-[14px] text-muted-foreground tabular-nums"
            dateTime={row.acceptedAtIso}
          >
            {row.acceptedAtLabel}
          </time>
        </article>
      ))}
    </div>
  )
}

import type { LastCommandPresentation } from '@ks/application'
import type { MatchCommand } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { StrilaBall } from '@/components/strila-ball'
import { protocolRowLabel } from '@/features/sparring/match/protocol/protocol-copy'
import { matchCommandFromControl } from '@/features/sparring/match/renderers/types'

export function LastCommandBar(props: {
  entry: LastCommandPresentation
  submitting: boolean
  onSubmit: (command: typeof MatchCommand.Type) => void
}) {
  const { t } = useTranslation()
  const { entry } = props
  const correction = entry.correction

  return (
    <section className="flex min-h-[68px] shrink-0 items-center gap-3 bg-background px-4 py-2">
      <div className="min-w-0 flex-1 text-base leading-tight">
        {entry.message.actor !== undefined && entry.message.actor.length > 0 ? (
          <p className="font-semibold break-words">{entry.message.actor}</p>
        ) : null}
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {entry.message.pottedBalls ? (
            <>
              <span className="sr-only">{protocolRowLabel(t, entry)}</span>
              <span aria-hidden>{t('match.protocol.commands.pot.record.default')}</span>
              <span aria-hidden className="inline-flex gap-1 self-center">
                {entry.message.pottedBalls.map((ball) => (
                  <StrilaBall key={ball} ball={ball} className="size-4" />
                ))}
              </span>
            </>
          ) : (
            <span>{protocolRowLabel(t, entry)}</span>
          )}
          {entry.score ? (
            <span className="text-[14px] text-muted-foreground">{`${entry.score.A}:${entry.score.B}`}</span>
          ) : null}
        </p>
      </div>
      {correction ? (
        <button
          type="button"
          disabled={props.submitting}
          onClick={() => props.onSubmit(matchCommandFromControl(correction))}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-overlay px-4 text-base font-medium disabled:opacity-100"
        >
          <CorrectionIcon />
          {t(keys.match.control.correction)}
        </button>
      ) : null}
    </section>
  )
}

function CorrectionIcon() {
  return (
    <svg aria-hidden className="size-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 8H2.5V3.5M3 8a9 9 0 1 1-.25 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

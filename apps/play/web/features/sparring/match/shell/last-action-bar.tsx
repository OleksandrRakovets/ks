import type { ProtocolRow } from '@ks/application'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { StrilaBall } from '@/components/strila-ball'
import { protocolRowLabel } from '@/features/sparring/match/protocol/protocol-copy'

export function LastActionBar({ entry }: { entry: Pick<ProtocolRow, 'key' | 'message' | 'score'> }) {
  const { t } = useTranslation()

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
      <button
        type="button"
        disabled
        className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-overlay px-4 text-base font-medium disabled:opacity-45"
      >
        <CorrectionIcon />
        {t(keys.match.control.correction)}
      </button>
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

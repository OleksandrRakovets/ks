import type { MatchCommand } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'

import { matchCommandForm, useProtocolLiveRevalidation } from '@/features/sparring/match/live'
import { MatchControlShell, MatchResultShell } from '@/features/sparring/match/shell/match-shell'
import type { ControlActionData, ProtocolPageData } from '@/features/sparring/match/types'

import { ProtocolPanel } from './protocol-panel'

export function MatchProtocolPage<K extends RegisteredGameKey>(props: { data: ProtocolPageData<K> }) {
  const { t } = useTranslation()
  const fetcher = useFetcher<ControlActionData>()
  useProtocolLiveRevalidation(props.data.match.state, props.data.match.latestSeq)

  function submitCommand(command: MatchCommand) {
    void fetcher.submit(matchCommandForm(command), { method: 'post' })
  }

  const content = (
    <div className="px-4 py-3">
      {fetcher.data?.ok === false ? (
        <p role="alert" className="mb-3 rounded-lg bg-destructive-dim px-3 py-2 text-base text-destructive">
          {t(fetcher.data.errorKey)}
        </p>
      ) : null}

      <ProtocolPanel rows={props.data.match.protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
    </div>
  )

  if (props.data.page === 'result') {
    return (
      <MatchResultShell active="protocol" data={props.data.match}>
        {content}
      </MatchResultShell>
    )
  }

  return (
    <MatchControlShell
      active="protocol"
      data={props.data.match}
      submitting={fetcher.state !== 'idle'}
      onSubmit={submitCommand}
    >
      {content}
    </MatchControlShell>
  )
}

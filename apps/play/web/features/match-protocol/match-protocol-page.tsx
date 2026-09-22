import type { MatchCommand } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'

import { MatchShell } from '@/features/match-control/shell/match-shell'
import type { MatchControlData } from '@/features/match-control/shell/types'
import { matchCommandForm, type ProtocolRouteData, useProtocolLiveRevalidation } from '@/routes/match/shared'
import type { ControlActionData } from '@/routes/match/shared'

import { ProtocolPanel } from './protocol-panel'

export function MatchProtocolPage<K extends RegisteredGameKey>(props: {
  control: MatchControlData<K>
  protocol: ProtocolRouteData<K>
}) {
  const { t } = useTranslation()
  const fetcher = useFetcher<ControlActionData>()
  useProtocolLiveRevalidation(props.protocol.state, props.protocol.latestSeq)

  function submitCommand(command: MatchCommand) {
    void fetcher.submit(matchCommandForm(command), { method: 'post' })
  }

  return (
    <MatchShell
      active="protocol"
      data={props.control}
      submitting={fetcher.state !== 'idle'}
      onSubmit={submitCommand}
    >
      <div className="px-4 py-3">
        {fetcher.data?.ok === false ? (
          <p role="alert" className="mb-3 rounded-lg bg-destructive-dim px-3 py-2 text-base text-destructive">
            {t(fetcher.data.errorKey)}
          </p>
        ) : null}

        <ProtocolPanel rows={props.protocol.protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
      </div>
    </MatchShell>
  )
}

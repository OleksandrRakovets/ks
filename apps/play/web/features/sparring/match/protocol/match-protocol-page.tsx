import type { GameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { useProtocolLiveRevalidation } from '@/features/sparring/match/live'
import { MatchProtocolShell, MatchResultShell } from '@/features/sparring/match/shell/match-shell'
import type { ProtocolPageData } from '@/features/sparring/match/types'

import { ProtocolPanel } from './protocol-panel'

export function MatchProtocolPage<K extends GameKey>(props: { data: ProtocolPageData<K> }) {
  const { t } = useTranslation()
  useProtocolLiveRevalidation(props.data.match.state, props.data.match.latestSeq)

  const content = (
    <div className="px-4 py-3">
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

  return <MatchProtocolShell data={props.data.match}>{content}</MatchProtocolShell>
}

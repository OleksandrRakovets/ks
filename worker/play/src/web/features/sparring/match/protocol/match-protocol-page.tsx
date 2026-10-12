import type { GameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { useProtocolLiveRevalidation } from '@/features/sparring/match/live'
import { ProtocolPanel } from '@/features/sparring/match/protocol/protocol-panel'
import { ActiveSurface, FinishedSurface } from '@/features/sparring/match/shell/surfaces'
import type { ProtocolPageData } from '@/features/sparring/match/types'

export function MatchProtocolPage<K extends GameKey>(props: { data: ProtocolPageData<K> }) {
  const { t } = useTranslation()
  useProtocolLiveRevalidation(props.data.match)

  const content = (
    <ProtocolPanel rows={props.data.match.protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
  )

  if (props.data.page === 'result') {
    return (
      <FinishedSurface active="protocol" data={props.data.match}>
        {content}
      </FinishedSurface>
    )
  }

  return (
    <ActiveSurface active="protocol" layout="reading" data={props.data.match}>
      {content}
    </ActiveSurface>
  )
}

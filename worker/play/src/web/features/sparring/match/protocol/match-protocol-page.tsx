import type { GameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { useProtocolLiveRevalidation } from '@/features/sparring/match/live'
import { ProtocolPanel } from '@/features/sparring/match/protocol/protocol-panel'
import { gameShowsFrames } from '@/features/sparring/match/shell/presentation'
import { ActiveSurface, FinishedSurface } from '@/features/sparring/match/shell/surfaces'
import type { ProtocolPageData } from '@/features/sparring/match/types'

export function MatchProtocolPage<K extends GameKey>(props: { data: ProtocolPageData<K> }) {
  const { t } = useTranslation()
  useProtocolLiveRevalidation(props.data.match)

  const { match } = props.data

  const content = (
    <ProtocolPanel
      rows={match.protocolRows}
      names={{ A: match.participants.A.displayName, B: match.participants.B.displayName }}
      showsFrames={gameShowsFrames(match.gameKey)}
      emptyLabel={t(keys.match.sparring.protocolEmpty)}
      startAtLatest={props.data.page !== 'result'}
    />
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

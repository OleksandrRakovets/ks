import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { useLoaderData } from 'react-router'

import { MatchNavigation } from '../../features/match-navigation'
import { ScoreBox } from '../sparring-match/score-box'
import type { Route } from './+types/combined-pyramid-protocol'
import { loadMatchProtocol, protocolFrameScore, ProtocolPanel, useProtocolLiveRevalidation } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocol(args, 'combined-pyramid')
}
export default function CombinedPyramidProtocolRoute() {
  const { t } = useTranslation()
  const data = useLoaderData<typeof loader>()
  useProtocolLiveRevalidation(data.state, data.latestSeq)
  return (
    <main className="flex flex-1 flex-col bg-surface">
      <MatchNavigation
        active="protocol"
        gameKey="combined-pyramid"
        matchId={data.state.matchId}
        matchStatus={data.state.status}
      />
      <ScoreBox
        nameA={data.participants.A.displayName}
        nameB={data.participants.B.displayName}
        matchScore={data.state.framesWonBySeat}
        frameScore={protocolFrameScore(data.state)}
        matchStatus={data.state.status}
        frameIndex={data.state.currentFrameIndex}
        targetFrames={data.state.targets.matchTargetFrames}
      />
      <div className="px-4 py-3 pb-12">
        <ProtocolPanel rows={data.protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
      </div>
    </main>
  )
}

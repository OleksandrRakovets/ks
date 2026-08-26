import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData } from 'react-router'

import { matchControlUrl } from '../../features/match-urls'
import { ScoreBox } from '../sparring-match/score-box'
import type { Route } from './+types/strila-v2-protocol'
import {
  loadMatchProtocol,
  protocolFrameScore,
  ProtocolPanel,
  type ProtocolRouteData,
  useProtocolLiveRevalidation,
} from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocol(args, 'strila-v2')
}
export const handle = {
  headerConfig: (data: ProtocolRouteData<'strila-v2'>) => ({
    titleKey: keys.match.sparring.protocolHeaderTitle,
    titleParams: { gameTitle: data.gameTitle },
    backTo: data.state.status === 'active' ? matchControlUrl('strila-v2', data.state.matchId) : '/sparring/matches/',
  }),
}

export default function StrilaV2ProtocolRoute() {
  const { t } = useTranslation()
  const data = useLoaderData<typeof loader>()
  useProtocolLiveRevalidation(data.state, data.latestSeq)
  return (
    <main className="flex flex-1 flex-col bg-surface">
      <ScoreBox
        nameA={data.participants.A.displayName}
        nameB={data.participants.B.displayName}
        matchScore={data.state.framesWonBySeat}
        frameScore={protocolFrameScore(data.state, data.controlProjection)}
        matchStatus={data.state.status}
        frameIndex={data.state.currentFrameIndex}
        targetFrames={data.state.targets.matchTargetFrames}
      />
      <div className="px-4 py-3 pb-12">
        <ProtocolPanel rows={data.protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
      </div>
      {data.state.status === 'active' ? (
        <nav className="sticky bottom-0 z-10 mt-auto flex h-14 border-t border-border bg-background">
          <Link
            to={matchControlUrl('strila-v2', data.state.matchId)}
            className="-mt-px flex flex-1 items-center justify-center border-t-2 border-transparent text-center text-base font-medium text-muted-foreground hover:text-foreground"
          >
            {t(keys.match.sparring.tabControl)}
          </Link>
          <span className="-mt-px flex flex-1 items-center justify-center border-t-2 border-primary text-center text-base font-medium text-foreground">
            {t(keys.match.sparring.tabProtocol)}
          </span>
        </nav>
      ) : null}
    </main>
  )
}

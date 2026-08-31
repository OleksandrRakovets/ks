import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData } from 'react-router'

import { BurgerMenu } from '../../components/BurgerMenu'
import { matchControlUrl } from '../../features/match-urls'
import { ScoreBox } from '../sparring-match/score-box'
import type { Route } from './+types/free-pyramid-long-protocol'
import { loadMatchProtocol, protocolFrameScore, ProtocolPanel, useProtocolLiveRevalidation } from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchProtocol(args, 'free-pyramid-long')
}
export default function FreePyramidLongProtocolRoute() {
  const { t } = useTranslation()
  const data = useLoaderData<typeof loader>()
  useProtocolLiveRevalidation(data.state, data.latestSeq)
  return (
    <main className="flex flex-1 flex-col bg-surface">
      <ScoreBox
        nameA={data.participants.A.displayName}
        nameB={data.participants.B.displayName}
        matchScore={data.state.framesWonBySeat}
        frameScore={protocolFrameScore(data.state)}
        matchStatus={data.state.status}
        frameIndex={data.state.currentFrameIndex}
        targetFrames={data.state.targets.matchTargetFrames}
        statusLine={data.gameTitle}
        headerless
        alwaysShowFrameScore
      />
      <div className="px-4 py-3 pb-20">
        <ProtocolPanel rows={data.protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
      </div>
      <nav className="sticky bottom-0 z-10 mt-auto flex h-14 border-t border-border bg-background">
        {data.state.status === 'active' ? (
          <Link
            to={matchControlUrl('free-pyramid-long', data.state.matchId)}
            className="-mt-px flex flex-1 items-center justify-center border-t-2 border-transparent text-center text-base font-medium text-muted-foreground hover:text-foreground"
          >
            {t(keys.match.sparring.tabControl)}
          </Link>
        ) : (
          <span className="-mt-px flex flex-1 items-center justify-center border-t-2 border-transparent text-center text-base font-medium text-muted-foreground">
            {t(keys.match.sparring.tabControl)}
          </span>
        )}
        <span className="-mt-px flex flex-1 items-center justify-center border-t-2 border-primary text-center text-base font-medium text-foreground">
          {t(keys.match.sparring.tabProtocol)}
        </span>
        <div className="flex-1">
          <BurgerMenu placement="navigation" />
        </div>
      </nav>
    </main>
  )
}

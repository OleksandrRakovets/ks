import type { MatchCommand } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher, useLoaderData } from 'react-router'

import { CombinedPyramidOldControlRenderer } from '../../features/match-control/renderers/pyramid-control-renderer'
import { matchProtocolUrl } from '../../features/match-urls'
import { ScoreBox } from '../sparring-match/score-box'
import type { Route } from './+types/combined-pyramid-old-control'
import {
  BetweenFrameControls,
  commandMatchAction,
  type ControlRouteData,
  loadMatchControl,
  matchCommandForm,
  useControlLiveRevalidation,
} from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchControl(args, 'combined-pyramid-old')
}
export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'combined-pyramid-old')
}
export const handle = {
  headerConfig: (data: ControlRouteData<'combined-pyramid-old'>) => ({
    titleKey: keys.match.sparring.controlHeaderTitle,
    titleParams: { gameTitle: data.gameTitle },
    backTo: '/sparring/matches/',
  }),
}

export default function CombinedPyramidOldControlRoute() {
  const { t } = useTranslation()
  const data = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const markLocalSubmit = useControlLiveRevalidation(data.state, data.latestSeq, fetcher)
  const snapshotFrame = data.state.frames[data.state.currentFrameIndex - 1]
  const frameScore =
    data.controlState === 'frame-active'
      ? data.controlProjection.score
      : (snapshotFrame?.pointsBySeat ?? { A: 0, B: 0 })
  function submitCommand(command: MatchCommand) {
    markLocalSubmit()
    fetcher.submit(matchCommandForm(command), { method: 'post' })
  }
  return (
    <main className="flex flex-1 flex-col bg-surface">
      <ScoreBox
        nameA={data.participants.A.displayName}
        nameB={data.participants.B.displayName}
        matchScore={data.state.framesWonBySeat}
        frameScore={frameScore}
        matchStatus={data.state.status}
        frameIndex={data.state.currentFrameIndex}
        targetFrames={data.state.targets.matchTargetFrames}
      />
      {data.controlState === 'frame-active' ? (
        <section aria-label={t(keys.match.control.perGameContainer)} className="flex flex-col">
          <CombinedPyramidOldControlRenderer
            projection={data.controlProjection}
            controlSections={data.controlSections}
            state={data.state}
            participants={data.participants}
            submitting={fetcher.state === 'submitting'}
            onSubmitCommand={submitCommand}
          />
        </section>
      ) : (
        <BetweenFrameControls
          sections={data.controlSections}
          submitting={fetcher.state === 'submitting'}
          onSubmit={submitCommand}
        />
      )}
      {fetcher.data?.ok === false ? (
        <p className="px-4 py-2 text-base text-destructive">{t(fetcher.data.errorKey)}</p>
      ) : null}
      <nav className="sticky bottom-0 z-10 mt-auto flex h-14 border-t border-border bg-background">
        <span className="-mt-px flex flex-1 items-center justify-center border-t-2 border-primary text-center text-base font-medium text-foreground">
          {t(keys.match.sparring.tabControl)}
        </span>
        <Link
          to={matchProtocolUrl('combined-pyramid-old', data.state.matchId)}
          className="-mt-px flex flex-1 items-center justify-center border-t-2 border-transparent text-center text-base font-medium text-muted-foreground hover:text-foreground"
        >
          {t(keys.match.sparring.tabProtocol)}
        </Link>
      </nav>
    </main>
  )
}

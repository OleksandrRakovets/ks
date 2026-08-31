import type { MatchCommand } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { useFetcher, useLoaderData } from 'react-router'

import { CombinedPyramidOldControlRenderer } from '../../features/match-control/renderers/pyramid-control-renderer'
import { MatchNavigation } from '../../features/match-navigation'
import { ScoreBox } from '../sparring-match/score-box'
import type { Route } from './+types/combined-pyramid-old-control'
import {
  BetweenFrameControls,
  commandMatchAction,
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
      <MatchNavigation
        active="control"
        gameKey="combined-pyramid-old"
        matchId={data.state.matchId}
        matchStatus={data.state.status}
      />
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
    </main>
  )
}

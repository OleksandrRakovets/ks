import type { MatchCommand } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { useFetcher, useLoaderData } from 'react-router'

import { LongFreePyramidControlRenderer } from '../../features/match-control/renderers/long-free-pyramid-control-renderer'
import { MatchNavigation } from '../../features/match-navigation'
import { ScoreBox } from '../sparring-match/score-box'
import type { Route } from './+types/free-pyramid-long-control'
import {
  BetweenFrameControls,
  commandMatchAction,
  loadMatchControl,
  matchCommandForm,
  useControlLiveRevalidation,
} from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchControl(args, 'free-pyramid-long')
}
export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'free-pyramid-long')
}
export default function FreePyramidLongControlRoute() {
  const { t } = useTranslation()
  const data = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const markLocalSubmit = useControlLiveRevalidation(data.state, data.latestSeq, fetcher)
  const snapshotFrame = data.state.frames[data.state.currentFrameIndex - 1]
  const frameScore =
    data.controlState === 'frame-active' ? data.game.score : (snapshotFrame?.pointsBySeat ?? { A: 0, B: 0 })
  const rack = data.controlState === 'frame-active' ? data.game.details.currentRack : null
  const statusLine =
    data.controlState === 'frame-active'
      ? `${data.gameTitle} · ${t(keys.match.control.longFreePyramid.rack, {
          rackNumber: rack?.rackNumber,
        })} · ${t(keys.match.control.longFreePyramid.ballsOnTable, {
          count: data.game.details.ballsOnTable,
        })}`
      : undefined
  function submitCommand(command: MatchCommand) {
    markLocalSubmit()
    void fetcher.submit(matchCommandForm(command), { method: 'post' })
  }
  return (
    <main className="flex flex-1 flex-col bg-surface">
      <MatchNavigation
        active="control"
        gameKey="free-pyramid-long"
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
        pottedBallCounts={rack?.scoreBySeat}
        statusLine={statusLine}
        alwaysShowFrameScore
      />
      {data.controlState === 'frame-active' ? (
        <section aria-label={t(keys.match.control.perGameContainer)} className="flex flex-col">
          <LongFreePyramidControlRenderer
            game={data.game}
            controls={data.controls}
            state={data.state}
            participants={data.participants}
            submitting={fetcher.state === 'submitting'}
            onSubmitCommand={submitCommand}
          />
        </section>
      ) : data.controlState === 'between-frames' ? (
        <BetweenFrameControls
          controls={data.controls}
          submitting={fetcher.state === 'submitting'}
          onSubmit={submitCommand}
        />
      ) : null}
      {fetcher.data?.ok === false ? (
        <p className="px-4 py-2 text-base text-destructive">{t(fetcher.data.errorKey)}</p>
      ) : null}
    </main>
  )
}

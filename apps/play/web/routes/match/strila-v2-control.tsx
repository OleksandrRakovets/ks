import type { MatchCommand } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { useFetcher, useLoaderData } from 'react-router'

import {
  StrilaControlRenderer,
  StrilaScoreMarkers,
} from '../../features/match-control/renderers/strila-control-renderer'
import { MatchNavigation } from '../../features/match-navigation'
import { ScoreBox } from '../sparring-match/score-box'
import type { Route } from './+types/strila-v2-control'
import {
  BetweenFrameControls,
  commandMatchAction,
  loadMatchControl,
  matchCommandForm,
  useControlLiveRevalidation,
} from './shared'

export function loader(args: Route.LoaderArgs) {
  return loadMatchControl(args, 'strila-v2')
}

export function action(args: Route.ActionArgs) {
  return commandMatchAction(args, 'strila-v2')
}

export default function StrilaV2ControlRoute() {
  const { t } = useTranslation()
  const data = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const markLocalSubmit = useControlLiveRevalidation(data.state, data.latestSeq, fetcher)
  const snapshotFrame = data.state.frames[data.state.currentFrameIndex - 1]
  const frameScore =
    data.controlState === 'frame-active' ? data.game.score : (snapshotFrame?.pointsBySeat ?? { A: 0, B: 0 })
  const pottedBalls = data.controlState === 'frame-active' ? data.game.details.pottedBallsBySeat : null

  function submitCommand(command: MatchCommand) {
    markLocalSubmit()
    fetcher.submit(matchCommandForm(command), { method: 'post' })
  }

  return (
    <main className="flex flex-1 flex-col bg-surface">
      <MatchNavigation
        active="control"
        gameKey="strila-v2"
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
        scoreMarkers={
          pottedBalls
            ? {
                A: <StrilaScoreMarkers balls={pottedBalls.A} align="right" />,
                B: <StrilaScoreMarkers balls={pottedBalls.B} align="left" />,
              }
            : undefined
        }
      />
      {data.controlState === 'frame-active' ? (
        <section aria-label={t(keys.match.control.perGameContainer)} className="flex flex-col">
          <StrilaControlRenderer
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

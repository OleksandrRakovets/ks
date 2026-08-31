import type { MatchCommand } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher, useLoaderData } from 'react-router'

import { BurgerMenu } from '../../components/BurgerMenu'
import { LongFreePyramidControlRenderer } from '../../features/match-control/renderers/long-free-pyramid-control-renderer'
import { matchProtocolUrl } from '../../features/match-urls'
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
export const handle = { headerless: true }

export default function FreePyramidLongControlRoute() {
  const { t } = useTranslation()
  const data = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const markLocalSubmit = useControlLiveRevalidation(data.state, data.latestSeq, fetcher)
  const snapshotFrame = data.state.frames[data.state.currentFrameIndex - 1]
  const frameScore =
    data.controlState === 'frame-active'
      ? data.controlProjection.score
      : (snapshotFrame?.pointsBySeat ?? { A: 0, B: 0 })
  const rack = data.controlState === 'frame-active' ? data.controlProjection.details.currentRack : null
  const statusLine =
    data.controlState === 'frame-active'
      ? `${data.gameTitle} · ${t(keys.match.control.longFreePyramid.rack, {
          rackNumber: rack?.rackNumber,
        })} · ${t(keys.match.control.longFreePyramid.ballsOnTable, {
          count: data.controlProjection.details.ballsOnTable,
        })}`
      : undefined
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
        pottedBallCounts={rack?.scoreBySeat}
        statusLine={statusLine}
        headerless
        alwaysShowFrameScore
      />
      {data.controlState === 'frame-active' ? (
        <section aria-label={t(keys.match.control.perGameContainer)} className="flex flex-col">
          <LongFreePyramidControlRenderer
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
          to={matchProtocolUrl('free-pyramid-long', data.state.matchId)}
          className="-mt-px flex flex-1 items-center justify-center border-t-2 border-transparent text-center text-base font-medium text-muted-foreground hover:text-foreground"
        >
          {t(keys.match.sparring.tabProtocol)}
        </Link>
        <div className="flex-1">
          <BurgerMenu placement="navigation" />
        </div>
      </nav>
    </main>
  )
}

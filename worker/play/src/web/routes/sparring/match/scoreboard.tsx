import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useFetcher, useLoaderData } from 'react-router'

import { useScoreboardLiveRevalidation } from '@/features/sparring/match/live'
import { presentScoreboard } from '@/features/sparring/scoreboard/presentation'
import {
  SCOREBOARD_BOXES,
  SCOREBOARD_STAGE,
  ScoreboardSvg,
} from '@/features/sparring/scoreboard/scoreboard-svg'
import { useRootLocale } from '@/root'
import { loadMatchScoreboard } from '@/routes/sparring/match/handlers'

import type { Route } from './+types/scoreboard'

export function loader(args: Route.LoaderArgs) {
  return loadMatchScoreboard(args)
}

/**
 * Background reads must never replace the stream with an error page: a failed read resolves to a
 * marker, and the page keeps its last good state. Only a client error (bad URL) stays an error.
 */
export async function clientLoader({
  serverLoader,
}: Route.ClientLoaderArgs): Promise<ScoreboardData | { readonly readFailed: true }> {
  try {
    return await serverLoader()
  } catch (error) {
    if (isRouteErrorResponse(error) && error.status < 500) throw error

    return { readFailed: true }
  }
}

type ScoreboardData = Awaited<ReturnType<typeof loader>>

/**
 * OBS browser-source page: a transparent 1920×1080 stage scaled to the viewport, holding only the
 * scoreboard artwork at its layout's fixed box. No app chrome, notices, or wake lock.
 */
export default function ScoreboardRoute() {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const loaderData: ScoreboardData = useLoaderData<typeof loader>()
  // Reads go through a fetcher of this route only, so the root loader is not re-read and cannot
  // surface a transient network failure in the root error boundary.
  const fetcher = useFetcher<typeof clientLoader>()
  const latest = fetcher.data ?? loaderData
  const [shown, setShown] = useState(loaderData)

  if (!('readFailed' in latest) && latest !== shown) setShown(latest)

  const read = () => fetcher.load(`${window.location.pathname}${window.location.search}`)

  const facts = useMemo(
    () => ({
      matchId: shown.matchId,
      lifecycle: shown.read.ok ? shown.read.lifecycle : ('missing' as const),
      latestSeq: shown.read.ok ? shown.read.latestSeq : 0,
      readFailed: 'readFailed' in latest,
    }),
    // A new object per committed read, including failed and equal-cursor reads.
    [latest, shown],
  )

  useScoreboardLiveRevalidation(facts, read)
  const box = SCOREBOARD_BOXES[shown.layout]

  return (
    <>
      {/* A dark color-scheme would paint Chromium's canvas dark behind a transparent root. */}
      <style>
        {
          'html, body { background: transparent !important; color-scheme: normal !important; overflow: hidden; }'
        }
      </style>
      <svg
        viewBox={`0 0 ${SCOREBOARD_STAGE.width} ${SCOREBOARD_STAGE.height}`}
        preserveAspectRatio="xMidYMax meet"
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%' }}
      >
        <g transform={`translate(${box.x} ${box.y})`}>
          <ScoreboardSvg
            values={presentScoreboard(shown.matchId, shown.read, t)}
            layout={shown.layout}
            theme={shown.theme}
            locale={locale}
          />
        </g>
      </svg>
    </>
  )
}

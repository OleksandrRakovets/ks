import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useFetcher, useRouteError } from 'react-router'

import { ReadRecovery } from '@/features/freshness/read-recovery'
import { useScoreboardLiveRevalidation } from '@/features/sparring/match/live'
import { presentScoreboard } from '@/features/sparring/scoreboard/presentation'
import { SCOREBOARD_STAGE, scoreboardBox, ScoreboardSvg } from '@/features/sparring/scoreboard/scoreboard-svg'
import { useRootLocale } from '@/root'
import { loadMatchScoreboard } from '@/routes/sparring/match/handlers'

import type { Route } from './+types/scoreboard'

export function loader(args: Route.LoaderArgs) {
  return loadMatchScoreboard(args)
}

/**
 * Background reads never replace the stream with an error page. Once the page has rendered, its
 * URL cannot change, so every failed read is transient: it resolves to a marker and the page keeps
 * its last good state.
 */
export async function clientLoader({
  serverLoader,
}: Route.ClientLoaderArgs): Promise<ScoreboardData | { readonly readFailed: true }> {
  try {
    return await serverLoader()
  } catch {
    return { readFailed: true }
  }
}

type ScoreboardData = Awaited<ReturnType<typeof loader>>

/**
 * OBS browser-source page: a transparent 1920×1080 stage scaled to the viewport, holding only the
 * scoreboard artwork at its layout's fixed box. No app chrome, notices, or wake lock.
 */
export default function ScoreboardRoute({ loaderData }: Route.ComponentProps) {
  return <ScoreboardPage initial={'readFailed' in loaderData ? null : loaderData} recover />
}

/**
 * A failed document load (OBS start or scene activation during a storage hiccup) stays transparent
 * and recovers through the same route read. A malformed URL (400/404) is final.
 */
export function ErrorBoundary() {
  const error = useRouteError()

  return <ScoreboardPage initial={null} recover={!(isRouteErrorResponse(error) && error.status < 500)} />
}

/**
 * Reads go through a fetcher of this route only, so the root loader is never re-read and a failed
 * read cannot reach the root error boundary. Until the first good read the stage stays empty.
 */
function ScoreboardPage(props: { initial: ScoreboardData | null; recover: boolean }) {
  const fetcher = useFetcher<typeof clientLoader>()
  const [shown, setShown] = useState(props.initial)
  const latest = fetcher.data

  if (latest !== undefined && !('readFailed' in latest) && latest !== shown) setShown(latest)

  const read = () => fetcher.load(`${window.location.pathname}${window.location.search}`)

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
        {shown === null ? (
          props.recover ? (
            <Recovery read={read} />
          ) : null
        ) : (
          <LiveScoreboard shown={shown} latest={latest} read={read} />
        )}
      </svg>
    </>
  )
}

function Recovery(props: { read: () => Promise<void> }) {
  // Starts once: restarting on each render (read is a new closure) would reset the deadline.
  const read = useRef(props.read)

  useLayoutEffect(() => {
    read.current = props.read
  })

  useEffect(() => {
    const recovery = new ReadRecovery(() => read.current())
    recovery.start()

    return () => recovery.dispose()
  }, [])

  return null
}

function LiveScoreboard(props: {
  shown: ScoreboardData
  latest: ScoreboardData | { readonly readFailed: true } | undefined
  read: () => Promise<void>
}) {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const { shown, latest } = props

  const facts = useMemo(
    () => ({
      matchId: shown.matchId,
      lifecycle: shown.read.ok ? shown.read.lifecycle : ('missing' as const),
      latestSeq: shown.read.ok ? shown.read.latestSeq : 0,
      readFailed: latest !== undefined && 'readFailed' in latest,
    }),
    // A new object per completed read, including failed and equal-cursor reads.
    [latest, shown],
  )

  useScoreboardLiveRevalidation(facts, props.read)
  const values = presentScoreboard(shown, t)
  const box = scoreboardBox(shown.layout, values.size)

  return (
    <g transform={`translate(${box.x} ${box.y})`}>
      <ScoreboardSvg values={values} layout={shown.layout} theme={shown.theme} locale={locale} />
    </g>
  )
}

import type { ReadMatchResult } from '@ks/application'
import type { MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'

import { ReadRecovery } from '@/features/freshness/read-recovery'
import {
  SCOREBOARD_STAGE,
  scoreboardBox,
  type ScoreboardLayout,
  scoreboardSourceArea,
} from '@/features/scoreboard/artwork/geometry'
import { ScoreboardSvg } from '@/features/scoreboard/artwork/scoreboard-svg'
import { presentScoreboard } from '@/features/scoreboard/present/present'
import type { ScoreboardTheme } from '@/features/scoreboard/themes/themes'
import type { ScoreboardNames } from '@/features/scoreboard/values'
import { useScoreboardLiveRevalidation } from '@/features/sparring/match/live'
import { useRootLocale } from '@/root'

/** What a scoreboard page's loader reads: the match and the URL's display options. */
export type ScoreboardSource = Readonly<{
  gameKey: GameKey
  matchId: MatchId
  read: ReadMatchResult<GameKey>
  layout: ScoreboardLayout
  theme: ScoreboardTheme
  names: ScoreboardNames
}>

/** A route's `clientLoader` resolves every failed background read to this marker. */
export type ScoreboardReadFailed = { readonly readFailed: true }

/**
 * OBS browser-source page: the layout's source area of the transparent stage, scaled to the
 * viewport, holding only the artwork at its fixed box. Reads go through a fetcher of the page's own
 * route, so the root loader is never re-read and a failed read cannot reach the root error
 * boundary. Until the first good read the stage stays empty.
 */
export function ScoreboardPage(props: { initial: ScoreboardSource | null; recover: boolean }) {
  const fetcher = useFetcher<ScoreboardSource | ScoreboardReadFailed>()
  const [shown, setShown] = useState(props.initial)
  const latest = fetcher.data

  if (latest !== undefined && !('readFailed' in latest) && latest !== shown) setShown(latest)

  const read = () => fetcher.load(`${window.location.pathname}${window.location.search}`)

  // Nothing paints before the first good read, so the full stage is as good as any area.
  const area = shown === null ? { x: 0, y: 0, ...SCOREBOARD_STAGE } : scoreboardSourceArea(shown.layout)

  return (
    <>
      {/* A dark color-scheme would paint Chromium's canvas dark behind a transparent root. */}
      <style>
        {
          'html, body { background: transparent !important; color-scheme: normal !important; overflow: hidden; }'
        }
      </style>
      <svg
        viewBox={`${area.x} ${area.y} ${area.width} ${area.height}`}
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
  shown: ScoreboardSource
  latest: ScoreboardSource | ScoreboardReadFailed | undefined
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

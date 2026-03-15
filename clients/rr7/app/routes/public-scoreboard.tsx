import type { MatchSnapshot } from '@ks/core'
import { themes } from '@ks/themes'
import { useEffect, type CSSProperties } from 'react'
import { useLoaderData, useParams, useRevalidator, useSearchParams } from 'react-router'
import type { LoaderFunctionArgs } from 'react-router'

import { requireEnv } from '../server/context'
import { fetchMatchSnapshot } from '../server/match-room'

export async function loader({ params, context }: LoaderFunctionArgs) {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const res = await fetchMatchSnapshot(env, matchId)
  const body = (await res.json()) as { ok: boolean; snapshot: MatchSnapshot }
  if (!body.ok) throw new Response('Failed to load snapshot', { status: 500 })
  return { snapshot: body.snapshot }
}

export default function PublicScoreboardRoute() {
  const { snapshot } = useLoaderData<typeof loader>()
  const params = useParams()
  const [sp] = useSearchParams()
  const revalidator = useRevalidator()
  const matchId = params.matchId ?? ''

  useEffect(() => {
    if (!matchId) return
    const timer = setInterval(() => revalidator.revalidate(), 1500)
    return () => clearInterval(timer)
  }, [matchId, revalidator])

  const themeId = (sp.get('theme') ?? 'club') as keyof typeof themes
  const themeVars = themes[themeId] ?? themes.club
  const cur = snapshot.frames[snapshot.frames.length - 1]
  const pointsA = cur?.pointsBySeat?.A ?? 0
  const pointsB = cur?.pointsBySeat?.B ?? 0
  const framesA = snapshot.framesWonBySeat?.A ?? 0
  const framesB = snapshot.framesWonBySeat?.B ?? 0
  const frameIndex = snapshot.currentFrameIndex ?? 1
  const nameA = snapshot.participants?.find((p) => p.seat === 'A')?.displayName ?? 'A'
  const nameB = snapshot.participants?.find((p) => p.seat === 'B')?.displayName ?? 'B'

  return (
    <div
      className="min-h-dvh px-6 py-6"
      style={Object.fromEntries(Object.entries(themeVars).map(([k, v]) => [k, v])) as CSSProperties}
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <div className="flex items-center justify-between gap-6">
            <div className="text-sm text-white/70">Frame {frameIndex}</div>
            <div className="text-sm text-white/70 tabular-nums">
              {framesA}:{framesB}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-white/5 p-4">
              <div className="text-sm text-white/70">{nameA}</div>
              <div className="mt-1 text-5xl font-semibold tabular-nums">{pointsA}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-4 text-right">
              <div className="text-sm text-white/70">{nameB}</div>
              <div className="mt-1 text-5xl font-semibold tabular-nums">{pointsB}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

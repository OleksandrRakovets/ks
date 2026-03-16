import { SnapshotResponseSchema, StreamEventSchema, StreamReadySchema } from '@ks/core'
import { themes } from '@ks/themes'
import { useEffect, useRef } from 'react'
import { useLoaderData, useParams, useRevalidator, useSearchParams } from 'react-router'

import { requireEnv } from '../server/context'
import { fetchMatchSnapshot } from '../server/match-room'
import type { Route } from './+types/public-scoreboard'

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const res = await fetchMatchSnapshot(env, matchId)
  const body = SnapshotResponseSchema.parse(await res.json())
  if (!body.ok) throw new Response('Failed to load snapshot', { status: 500 })
  return { snapshot: body.snapshot }
}

function isThemeId(value: string): value is keyof typeof themes {
  return value in themes
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function PublicScoreboardRoute() {
  const { snapshot } = useLoaderData<typeof loader>()
  const params = useParams()
  const [sp] = useSearchParams()
  const revalidator = useRevalidator()
  const latestSeqRef = useRef(snapshot.latestSeq)
  const matchId = params.matchId ?? ''

  useEffect(() => {
    latestSeqRef.current = snapshot.latestSeq
  }, [snapshot.latestSeq])

  useEffect(() => {
    if (!matchId) return

    const stream = new EventSource(`/api/m/${matchId}/stream`)

    const handleReady = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const decoded = tryParseJson(event.data)
      if (decoded === null) {
        console.error('Malformed SSE ready event JSON', event.data)
        return
      }

      const parsed = StreamReadySchema.safeParse(decoded)
      if (!parsed.success) {
        console.error('Malformed SSE ready event payload', parsed.error)
        return
      }

      if (parsed.data.latestSeq > latestSeqRef.current) {
        revalidator.revalidate()
      }
    }

    const handleEvent = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const decoded = tryParseJson(event.data)
      if (decoded === null) {
        console.error('Malformed SSE match event JSON', event.data)
        return
      }

      const parsed = StreamEventSchema.safeParse(decoded)
      if (!parsed.success) {
        console.error('Malformed SSE match event payload', parsed.error)
        return
      }

      if (parsed.data.seq <= latestSeqRef.current) return
      latestSeqRef.current = parsed.data.seq
      revalidator.revalidate()
    }

    stream.addEventListener('ready', handleReady)
    stream.addEventListener('ev', handleEvent)

    return () => {
      stream.removeEventListener('ready', handleReady)
      stream.removeEventListener('ev', handleEvent)
      stream.close()
    }
  }, [matchId, revalidator])

  const rawThemeId = sp.get('theme')
  const themeId = rawThemeId && isThemeId(rawThemeId) ? rawThemeId : 'club'
  const themeVars = themes[themeId]
  const cur = snapshot.frames[snapshot.frames.length - 1]
  const pointsA = cur?.pointsBySeat?.A ?? 0
  const pointsB = cur?.pointsBySeat?.B ?? 0
  const framesA = snapshot.framesWonBySeat?.A ?? 0
  const framesB = snapshot.framesWonBySeat?.B ?? 0
  const frameIndex = snapshot.currentFrameIndex ?? 1
  const nameA = snapshot.participants?.find((p) => p.seat === 'A')?.displayName ?? 'A'
  const nameB = snapshot.participants?.find((p) => p.seat === 'B')?.displayName ?? 'B'

  return (
    <div className="min-h-dvh px-6 py-6" style={themeVars}>
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

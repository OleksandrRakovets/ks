import type { MatchSnapshot, StoredEvent } from '@ks/core'

import { applyEvent, emptyState } from '@ks/games'
import { themes } from '@ks/themes'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router'

import { getSnapshot } from '../api/ks'

export function PublicScoreboard() {
  const params = useParams()
  const [sp] = useSearchParams()
  const matchId = params.matchId ?? ''

  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null)
  const [events, setEvents] = useState<StoredEvent[]>([])
  const lastSeqRef = useRef(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!matchId) return
    let alive = true
    void (async () => {
      try {
        const snap = await getSnapshot(matchId)
        if (!alive) return
        setSnapshot(snap)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [matchId])

  useEffect(() => {
    if (!matchId) return
    const url = `/api/matches/${matchId}/stream?since=0`
    const es = new EventSource(url)
    es.addEventListener('ev', (msg) => {
      const data = JSON.parse((msg as MessageEvent).data) as StoredEvent
      if (data.seq <= lastSeqRef.current) return
      lastSeqRef.current = data.seq
      setEvents((prev) => [...prev, data])
    })
    return () => es.close()
  }, [matchId])

  const state = useMemo(() => {
    if (!snapshot) return null
    if (events.length === 0) return null
    let s = emptyState()
    for (const ev of events) s = applyEvent(s, ev)
    return s
  }, [events, snapshot])

  const themeId = (sp.get('theme') ?? 'club') as keyof typeof themes
  const themeVars = themes[themeId] ?? themes.club

  const cur = state?.frames?.[state.frames.length - 1] ?? snapshot?.frames?.[snapshot.frames.length - 1]
  const pointsA = cur?.pointsBySeat?.A ?? 0
  const pointsB = cur?.pointsBySeat?.B ?? 0
  const framesA = state?.framesWonBySeat.A ?? snapshot?.framesWonBySeat?.A ?? 0
  const framesB = state?.framesWonBySeat.B ?? snapshot?.framesWonBySeat?.B ?? 0
  const frameIndex = state?.currentFrameIndex ?? snapshot?.currentFrameIndex ?? 1
  const nameA = snapshot?.participants?.find((p) => p.seat === 'A')?.displayName ?? 'A'
  const nameB = snapshot?.participants?.find((p) => p.seat === 'B')?.displayName ?? 'B'

  if (error) {
    return <div className="p-6 text-red-200">{error}</div>
  }

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

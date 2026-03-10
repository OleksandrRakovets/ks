import type { MatchSnapshot, StoredEvent } from '@ks/core'

import { applyEvent, emptyState, isRegisteredGameKey, registry, type RegisteredGameKey } from '@ks/games'
import { keys } from '@ks/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { getSnapshot, makeAwardFrameEvent, makeShotRecordedEvent, makeStartFrameEvent, postEvents } from '../lib/ks'

function PyramidShotControls(props: {
  matchId: string
  controlSecret: string
  gameKey: RegisteredGameKey
  seat: 'A' | 'B'
  canScore: boolean
}) {
  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        className="flex-1 rounded-lg bg-white/10 px-3 py-2"
        disabled={!props.canScore}
        aria-disabled={!props.canScore}
        onClick={() =>
          postEvents(props.matchId, props.controlSecret, [makeShotRecordedEvent(props.matchId, props.gameKey, props.seat, 1)])
        }
      >
        +1
      </button>
      <button
        type="button"
        className="flex-1 rounded-lg bg-white/10 px-3 py-2"
        disabled={!props.canScore}
        aria-disabled={!props.canScore}
        onClick={() =>
          postEvents(props.matchId, props.controlSecret, [makeShotRecordedEvent(props.matchId, props.gameKey, props.seat, -1)])
        }
      >
        -1
      </button>
    </div>
  )
}

export default function ControlMatchRoute() {
  const { t } = useTranslation()
  const params = useParams()
  const matchId = params.matchId ?? ''
  const controlSecret = params.controlSecret ?? ''

  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null)
  const [events, setEvents] = useState<StoredEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const lastSeqRef = useRef(0)

  const derived = useMemo(() => {
    if (!events.length) return null
    let s = emptyState()
    for (const ev of events) s = applyEvent(s, ev)
    return s
  }, [events])

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
    es.addEventListener('ready', () => {
      // noop
    })
    es.onerror = () => {
      // browser auto-reconnects
    }
    return () => es.close()
  }, [matchId])

  const cur = derived?.frames?.[derived.frames.length - 1]
  const snapCur = snapshot?.frames?.[snapshot.frames.length - 1]
  const frameIndex = derived?.currentFrameIndex ?? snapshot?.currentFrameIndex ?? 1
  const pointsA = (cur ?? snapCur)?.pointsBySeat?.A ?? 0
  const pointsB = (cur ?? snapCur)?.pointsBySeat?.B ?? 0
  const targetA = snapshot?.targets?.frameTargetPointsBySeat?.A ?? 0
  const targetB = snapshot?.targets?.frameTargetPointsBySeat?.B ?? 0
  const maybeGameKey = derived?.config?.gameKey ?? snapshot?.gameKey
  const gameKey: RegisteredGameKey = maybeGameKey && isRegisteredGameKey(maybeGameKey) ? maybeGameKey : 'free-pyramid'
  const inputMode = registry[gameKey].meta.inputMode
  const winnerSeat = (cur ?? snapCur)?.winnerSeat
  const canAwardA = targetA > 0 && pointsA >= targetA && !winnerSeat
  const canAwardB = targetB > 0 && pointsB >= targetB && !winnerSeat
  const canScore = !winnerSeat
  const canStartNextFrame = Boolean(winnerSeat)

  if (error) {
    return <div className="p-6 text-red-200">{error}</div>
  }

  return (
    <div className="min-h-dvh px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm text-white/70">{matchId}</div>
            <h1 className="text-2xl font-semibold tracking-tight">{t(keys.match.control.title)}</h1>
          </div>
          <div className="text-right text-sm text-white/70">Frame {frameIndex}</div>
        </div>

        <div className="mt-6 grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/70">A</div>
              <div className="mt-1 text-4xl font-semibold tabular-nums">{pointsA}</div>
              {inputMode === 'pyramid-basic' ? (
                <PyramidShotControls
                  matchId={matchId}
                  controlSecret={controlSecret}
                  gameKey={gameKey}
                  seat="A"
                  canScore={canScore}
                />
              ) : null}
              {canAwardA ? (
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg bg-[var(--ks-accent)] px-3 py-2 font-semibold text-black"
                  onClick={() => postEvents(matchId, controlSecret, [makeAwardFrameEvent(matchId, 'A', frameIndex)])}
                >
                  {t(keys.match.control.awardFrame)}
                </button>
              ) : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/70">B</div>
              <div className="mt-1 text-4xl font-semibold tabular-nums">{pointsB}</div>
              {inputMode === 'pyramid-basic' ? (
                <PyramidShotControls
                  matchId={matchId}
                  controlSecret={controlSecret}
                  gameKey={gameKey}
                  seat="B"
                  canScore={canScore}
                />
              ) : null}
              {canAwardB ? (
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg bg-[var(--ks-accent)] px-3 py-2 font-semibold text-black"
                  onClick={() => postEvents(matchId, controlSecret, [makeAwardFrameEvent(matchId, 'B', frameIndex)])}
                >
                  {t(keys.match.control.awardFrame)}
                </button>
              ) : null}
            </div>
          </div>

          {canStartNextFrame ? (
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm"
              onClick={() => postEvents(matchId, controlSecret, [makeStartFrameEvent(matchId, frameIndex + 1)])}
            >
              Start next frame
            </button>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-white/70">Event log</div>
            <div className="mt-3 grid gap-2 text-sm">
              {events.slice(-20).map((e) => (
                <div key={`${e.seq}-${e.eventId}`} className="flex items-center justify-between gap-3">
                  <div className="text-white/80">
                    <span className="text-white/50">#{e.seq}</span> {e.type}
                  </div>
                  <div className="text-white/50">{new Date(e.receivedAt).toLocaleTimeString()}</div>
                </div>
              ))}
              {!events.length ? <div className="text-white/50">Waiting for stream...</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

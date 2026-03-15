import { ClientEventSchema, type MatchSnapshot } from '@ks/core'
import { isRegisteredGameKey, registry, type RegisteredGameKey } from '@ks/gameplay'
import { useEffect } from 'react'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { useFetcher, useLoaderData, useParams, useRevalidator } from 'react-router'

import { makeAwardFrameEvent, makeShotRecordedEvent, makeStartFrameEvent } from '../lib/ks'
import { requireEnv } from '../server/context'
import { fetchMatchSnapshot, postMatchEvents } from '../server/match-room'

export async function loader({ params, context }: LoaderFunctionArgs) {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const res = await fetchMatchSnapshot(env, matchId)
  const body = (await res.json()) as { ok: boolean; snapshot: MatchSnapshot }
  if (!body.ok) throw new Response('Failed to load snapshot', { status: 500 })
  return { snapshot: body.snapshot }
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const form = await request.formData()
  const controlSecret = String(form.get('controlSecret') ?? '')
  const rawEvent = String(form.get('event') ?? '')
  const parsedEvent = ClientEventSchema.safeParse(JSON.parse(rawEvent))
  if (!parsedEvent.success) {
    return { ok: false as const, error: 'Invalid event payload' }
  }

  const res = await postMatchEvents(env, matchId, controlSecret, [parsedEvent.data])
  const payload = (await res.json()) as { ok: boolean; error?: string }
  if (!payload.ok) {
    return { ok: false as const, error: payload.error ?? 'Failed to append event' }
  }
  return { ok: true as const }
}

function PyramidShotControls(props: { seat: 'A' | 'B'; canScore: boolean; onShot: (seat: 'A' | 'B', points: number) => void }) {
  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        className="flex-1 rounded-lg bg-white/10 px-3 py-2"
        disabled={!props.canScore}
        onClick={() => props.onShot(props.seat, 1)}
      >
        +1
      </button>
      <button
        type="button"
        className="flex-1 rounded-lg bg-white/10 px-3 py-2"
        disabled={!props.canScore}
        onClick={() => props.onShot(props.seat, -1)}
      >
        -1
      </button>
    </div>
  )
}

export default function ControlMatchRoute() {
  const { snapshot } = useLoaderData<typeof loader>()
  const params = useParams()
  const matchId = params.matchId ?? ''
  const controlSecret = params.controlSecret ?? ''
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()

  useEffect(() => {
    const timer = setInterval(() => revalidator.revalidate(), 1500)
    return () => clearInterval(timer)
  }, [revalidator])

  const cur = snapshot.frames[snapshot.frames.length - 1]
  const frameIndex = snapshot.currentFrameIndex
  const pointsA = cur?.pointsBySeat.A ?? 0
  const pointsB = cur?.pointsBySeat.B ?? 0
  const targetA = snapshot.targets.frameTargetPointsBySeat.A
  const targetB = snapshot.targets.frameTargetPointsBySeat.B
  const maybeGameKey = snapshot.gameKey
  const gameKey: RegisteredGameKey = isRegisteredGameKey(maybeGameKey) ? maybeGameKey : 'free-pyramid'
  const inputMode = registry[gameKey].meta.inputMode
  const winnerSeat = cur?.winnerSeat
  const canAwardA = targetA > 0 && pointsA >= targetA && !winnerSeat
  const canAwardB = targetB > 0 && pointsB >= targetB && !winnerSeat
  const canScore = !winnerSeat

  function submitEvent(event: unknown) {
    fetcher.submit({ controlSecret, event: JSON.stringify(event) }, { method: 'post' })
  }

  return (
    <div className="min-h-dvh px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm text-white/70">{matchId}</div>
            <h1 className="text-2xl font-semibold tracking-tight">Control Match</h1>
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
                  seat="A"
                  canScore={canScore}
                  onShot={(seat, points) => submitEvent(makeShotRecordedEvent(matchId, gameKey, seat, points))}
                />
              ) : null}
              {canAwardA ? (
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg bg-[var(--ks-accent)] px-3 py-2 font-semibold text-black"
                  onClick={() => submitEvent(makeAwardFrameEvent(matchId, 'A', frameIndex))}
                >
                  Award frame
                </button>
              ) : null}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/70">B</div>
              <div className="mt-1 text-4xl font-semibold tabular-nums">{pointsB}</div>
              {inputMode === 'pyramid-basic' ? (
                <PyramidShotControls
                  seat="B"
                  canScore={canScore}
                  onShot={(seat, points) => submitEvent(makeShotRecordedEvent(matchId, gameKey, seat, points))}
                />
              ) : null}
              {canAwardB ? (
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg bg-[var(--ks-accent)] px-3 py-2 font-semibold text-black"
                  onClick={() => submitEvent(makeAwardFrameEvent(matchId, 'B', frameIndex))}
                >
                  Award frame
                </button>
              ) : null}
            </div>
          </div>

          {winnerSeat ? (
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm"
              onClick={() => submitEvent(makeStartFrameEvent(matchId, frameIndex + 1))}
            >
              Start next frame
            </button>
          ) : null}

          {fetcher.data?.ok === false ? <div className="text-sm text-red-200">{fetcher.data.error}</div> : null}
        </div>
      </div>
    </div>
  )
}

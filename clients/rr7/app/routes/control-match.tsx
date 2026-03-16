import { ClientEventSchema, type MatchSnapshot } from '@ks/core'
import { deriveMatchControlDecisions, isRegisteredGameKey, registry, type RegisteredGameKey } from '@ks/gameplay'
import { Button, Card, CardContent } from '@ks/ui'
import { useEffect } from 'react'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { useFetcher, useLoaderData, useParams, useRevalidator, useSearchParams } from 'react-router'

import { makeAwardFrameEvent, makeEndMatchEvent, makeShotRecordedEvent, makeStartFrameEvent } from '../lib/ks'
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
  const payload = (await res.json()) as { ok: boolean; error?: string; accepted?: { seq: number; eventId: string }[] }
  if (!payload.ok) {
    return { ok: false as const, error: payload.error ?? 'Failed to append event' }
  }
  if (!payload.accepted || payload.accepted.length === 0) {
    return { ok: false as const, error: 'Event rejected by match rules' }
  }
  return { ok: true as const }
}

function PyramidShotControls(props: { seat: 'A' | 'B'; canScore: boolean; onShot: (seat: 'A' | 'B', points: number) => void }) {
  return (
    <div className="mt-2 flex gap-2">
      <Button
        type="button"
        className="flex-1"
        variant="secondary"
        disabled={!props.canScore}
        onClick={() => props.onShot(props.seat, 1)}
      >
        +1
      </Button>
      <Button
        type="button"
        className="flex-1"
        variant="outline"
        disabled={!props.canScore}
        onClick={() => props.onShot(props.seat, -1)}
      >
        -1
      </Button>
    </div>
  )
}

export default function ControlMatchRoute() {
  const { snapshot } = useLoaderData<typeof loader>()
  const params = useParams()
  const matchId = params.matchId ?? ''
  const controlSecret = params.controlSecret ?? ''
  const [searchParams] = useSearchParams()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()
  const flavorClass = searchParams.get('flavor') === 'latte' ? 'latte' : 'dark'

  useEffect(() => {
    const timer = setInterval(() => revalidator.revalidate(), 1500)
    return () => clearInterval(timer)
  }, [revalidator])

  const cur = snapshot.frames[snapshot.frames.length - 1]
  const frameIndex = snapshot.currentFrameIndex
  const pointsA = cur?.pointsBySeat.A ?? 0
  const pointsB = cur?.pointsBySeat.B ?? 0
  const maybeGameKey = snapshot.gameKey
  const gameKey: RegisteredGameKey = isRegisteredGameKey(maybeGameKey) ? maybeGameKey : 'free-pyramid'
  const inputMode = registry[gameKey].meta.inputMode
  const decisions = deriveMatchControlDecisions(snapshot)
  const canAwardA = decisions.canAwardBySeat.A
  const canAwardB = decisions.canAwardBySeat.B
  const canScore = decisions.canScore

  function submitEvent(event: unknown) {
    fetcher.submit({ controlSecret, event: JSON.stringify(event) }, { method: 'post' })
  }

  return (
    <div className={`${flavorClass} min-h-dvh bg-background px-4 py-6 text-foreground`}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">{matchId}</div>
            <h1 className="text-2xl font-semibold tracking-tight">Control Match</h1>
          </div>
          <div className="text-right text-sm text-muted-foreground">Frame {frameIndex}</div>
        </div>

        <div className="mt-6 grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">A</div>
                <div className="mt-1 text-4xl font-semibold tabular-nums">{pointsA}</div>
                {inputMode === 'pyramid-basic' ? (
                  <PyramidShotControls
                    seat="A"
                    canScore={canScore}
                    onShot={(seat, points) => submitEvent(makeShotRecordedEvent(matchId, gameKey, seat, points))}
                  />
                ) : null}
                {canAwardA ? (
                  <Button className="mt-3 w-full" onClick={() => submitEvent(makeAwardFrameEvent(matchId, 'A', frameIndex))}>
                    Award frame
                  </Button>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">B</div>
                <div className="mt-1 text-4xl font-semibold tabular-nums">{pointsB}</div>
                {inputMode === 'pyramid-basic' ? (
                  <PyramidShotControls
                    seat="B"
                    canScore={canScore}
                    onShot={(seat, points) => submitEvent(makeShotRecordedEvent(matchId, gameKey, seat, points))}
                  />
                ) : null}
                {canAwardB ? (
                  <Button className="mt-3 w-full" onClick={() => submitEvent(makeAwardFrameEvent(matchId, 'B', frameIndex))}>
                    Award frame
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {decisions.canStartNextFrame ? (
            <Button
              type="button"
              variant="secondary"
              className="h-auto justify-start rounded-xl px-4 py-3 text-left text-sm"
              onClick={() => submitEvent(makeStartFrameEvent(matchId, frameIndex + 1))}
            >
              Start next frame
            </Button>
          ) : null}

          {decisions.canEndMatch ? (
            <Button
              type="button"
              variant="secondary"
              className="h-auto justify-start rounded-xl px-4 py-3 text-left text-sm"
              onClick={() => submitEvent(makeEndMatchEvent(matchId))}
            >
              End match
            </Button>
          ) : null}

          {fetcher.data?.ok === false ? <div className="text-sm text-destructive">{fetcher.data.error}</div> : null}
        </div>
      </div>
    </div>
  )
}

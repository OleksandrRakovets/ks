import { ClientEventSchema, PostEventsResponseSchema, SnapshotResponseSchema } from '@ks/core'
import { deriveMatchControlDecisions } from '@ks/competition'
import { isRegisteredGameKey, registry, type RegisteredGameKey } from '@ks/gameplay'
import { keys } from '@ks/i18n'
import { Button, Card, CardContent } from '@ks/ui'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher, useLoaderData, useParams, useRevalidator, useSearchParams } from 'react-router'

import { makeAwardFrameEvent, makeEndMatchEvent, makeShotRecordedEvent, makeStartFrameEvent } from '../lib/ks'
import { requireEnv } from '../server/context'
import { localeFromCookie } from '../server/locale'
import { fetchMatchSnapshot, postMatchEvents } from '../server/match-room'
import type { Route } from './+types/control-match'

type ControlMatchActionResult =
  | { ok: true }
  | {
      ok: false
      error?: string
      errorKey?: typeof keys.match.control.invalidEventPayload | typeof keys.match.control.eventRejectedByRules
    }

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const res = await fetchMatchSnapshot(env, matchId, localeFromCookie(request.headers.get('cookie')))
  const body = SnapshotResponseSchema.parse(await res.json())
  if (!body.ok) throw new Response('Failed to load snapshot', { status: 500 })
  return { snapshot: body.snapshot, participants: body.participants }
}

export async function action({ params, request, context }: Route.ActionArgs): Promise<ControlMatchActionResult> {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const form = await request.formData()
  const controlSecret = String(form.get('controlSecret') ?? '')
  const rawEvent = String(form.get('event') ?? '')
  let decodedEvent: unknown
  try {
    decodedEvent = JSON.parse(rawEvent)
  } catch {
    return { ok: false, errorKey: keys.match.control.invalidEventPayload }
  }

  const parsedEvent = ClientEventSchema.safeParse(decodedEvent)
  if (!parsedEvent.success) {
    return { ok: false, errorKey: keys.match.control.invalidEventPayload }
  }

  const res = await postMatchEvents(env, matchId, controlSecret, [parsedEvent.data])
  const payload = PostEventsResponseSchema.parse(await res.json())
  if (!payload.ok) {
    return { ok: false, error: payload.error }
  }
  if (payload.accepted.length === 0) {
    return { ok: false, errorKey: keys.match.control.eventRejectedByRules }
  }
  return { ok: true }
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
  const { t } = useTranslation()
  const { snapshot, participants } = useLoaderData<typeof loader>()
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
            <h1 className="text-2xl font-semibold tracking-tight">{t(keys.match.control.title)}</h1>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            {t(keys.match.scoreboard.frame)} {frameIndex}
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">{participants.A.shortDisplayName}</div>
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
                    {t(keys.match.control.awardFrame)}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">{participants.B.shortDisplayName}</div>
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
                    {t(keys.match.control.awardFrame)}
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
              {t(keys.match.control.startNextFrame)}
            </Button>
          ) : null}

          {decisions.canEndMatch ? (
            <Button
              type="button"
              variant="secondary"
              className="h-auto justify-start rounded-xl px-4 py-3 text-left text-sm"
              onClick={() => submitEvent(makeEndMatchEvent(matchId))}
            >
              {t(keys.match.control.endMatch)}
            </Button>
          ) : null}

          {fetcher.data?.ok === false ? (
            <div className="text-sm text-destructive">
              {fetcher.data.errorKey ? t(fetcher.data.errorKey) : fetcher.data.error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

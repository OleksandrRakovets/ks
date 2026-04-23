import { deriveMatchLifecycleDecisions } from '@ks/competition'
import {
  ClientIdSchema,
  ClientEventSchema,
  ErrorResponseSchema,
  FrameStartedEventSchema,
  HydratedMatchParticipantsSchema,
  GameCommandEventSchema,
  MatchSnapshotSchema,
  MatchEndedEventSchema,
  MatchIdSchema,
  newEventId,
  PostEventsResponseSchema,
  StreamEventSchema,
  StreamReadySchema,
} from '@ks/core'
import { GameControlProjectionSchema, isRegisteredGameKey, registry, type RegisteredGameKey } from '@ks/gameplay'
import { keys } from '@ks/i18n'
import { Button } from '@ks/ui'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, redirect, useFetcher, useLoaderData, useRevalidator } from 'react-router'
import { z } from 'zod'

import {
  resolveControlRenderer,
  type GameControlProjection,
  type HydratedMatchParticipants,
} from '../../features/match-control/renderers'
import type { AppLoadContext } from '../../server/context'
import { requireEnv } from '../../server/context'
import { localeFromCookie } from '../../server/locale'
import { fetchMatchSnapshot, getMatchControlSecret, postMatchEvents } from '../../server/match-room'
import { ScoreBox } from './score-box'

type LoaderData = {
  snapshot: Awaited<ReturnType<typeof parseSnapshotBody>>['snapshot']
  participants: HydratedMatchParticipants
  controlProjection: GameControlProjection
  gameTitle: string
}

type ActionData =
  | { ok: true; acceptedSeqMax: number | null }
  | {
      ok: false
      error?: string
      errorKey?: typeof keys.match.control.invalidEventPayload | typeof keys.match.control.eventRejectedByRules
    }

const SnapshotResponseWithControlSchema = z.union([
  z.object({
    ok: z.literal(true),
    snapshot: MatchSnapshotSchema,
    participants: HydratedMatchParticipantsSchema,
    controlProjection: GameControlProjectionSchema.optional(),
  }),
  ErrorResponseSchema,
])

function emptyControlProjection(gameKey: string): GameControlProjection {
  return {
    gameKey,
    projection: 'control',
    score: { A: 0, B: 0 },
    availableCommands: [],
  }
}

async function parseSnapshotBody(res: Response) {
  const body = SnapshotResponseWithControlSchema.parse(await res.json())
  if (!body.ok) {
    throw new Response(body.error, { status: res.status === 200 ? 500 : res.status })
  }
  return body
}

export async function loader({
  params,
  request,
  context,
}: {
  params: { matchId?: string }
  request: Request
  context: AppLoadContext
}): Promise<LoaderData> {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const locale = localeFromCookie(request.headers.get('cookie'))
  const res = await fetchMatchSnapshot(env, matchId, locale)
  const body = await parseSnapshotBody(res)

  if (body.snapshot.status !== 'active') {
    throw redirect(`/sparring/matches/${matchId}/protocol`)
  }

  const { gameKey } = body.snapshot
  const gameTitle = isRegisteredGameKey(gameKey) ? registry[gameKey].meta.title[locale] : gameKey

  return {
    snapshot: body.snapshot,
    participants: body.participants,
    controlProjection: body.controlProjection ?? emptyControlProjection(gameKey),
    gameTitle,
  }
}

export async function action({
  params,
  request,
  context,
}: {
  params: { matchId?: string }
  request: Request
  context: AppLoadContext
}): Promise<ActionData> {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const controlSecret = await getMatchControlSecret(env, matchId)
  if (!controlSecret) {
    return { ok: false, error: 'Unknown match' }
  }

  const form = await request.formData()
  const actionType = String(form.get('actionType') ?? 'game-command')
  const frameIndex = Number(form.get('frameIndex') ?? '0')
  const parsedMatchId = MatchIdSchema.parse(matchId)
  const parsedClientId = ClientIdSchema.parse('server0000')

  function serverEventBase() {
    return {
      eventId: newEventId(),
      matchId: parsedMatchId,
      clientId: parsedClientId,
      clientSeq: 0,
      at: Date.now(),
    }
  }

  let event: unknown

  if (actionType === 'start-next-frame') {
    event = FrameStartedEventSchema.parse({
      ...serverEventBase(),
      type: 'frame.started',
      payload: { frameIndex: frameIndex + 1 },
    })
  } else if (actionType === 'end-match') {
    event = MatchEndedEventSchema.parse({
      ...serverEventBase(),
      type: 'match.ended',
      payload: { reason: 'manual-control' },
    })
  } else {
    const gameKey = String(form.get('gameKey') ?? '')
    const commandType = String(form.get('commandType') ?? '')
    const rawCommandJson = String(form.get('commandJson') ?? '{}')
    let parsedCommand: unknown
    try {
      parsedCommand = JSON.parse(rawCommandJson)
    } catch {
      return { ok: false, errorKey: keys.match.control.invalidEventPayload }
    }

    if (!isRegisteredGameKey(gameKey)) {
      return { ok: false, errorKey: keys.match.control.invalidEventPayload }
    }

    event = GameCommandEventSchema.parse({
      ...serverEventBase(),
      type: 'game.command',
      payload: {
        gameKey: gameKey as RegisteredGameKey,
        commandType,
        command: (parsedCommand ?? {}) as Record<string, unknown>,
      },
    })
  }

  const parsedEvent = ClientEventSchema.safeParse(event)
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

  const acceptedSeqMax = payload.accepted.reduce<number | null>((max, entry) => {
    if (max == null) return entry.seq
    return Math.max(max, entry.seq)
  }, null)

  return { ok: true, acceptedSeqMax }
}

export const handle = {
  headerConfig: (data: LoaderData) => ({
    title: `Спаринг: ${data.gameTitle}`,
    backTo: '/sparring/matches',
  }),
}

export default function SparringMatchRoute() {
  const { t } = useTranslation()
  const { snapshot, participants, controlProjection } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()

  const latestSeqRef = useRef(snapshot.latestSeq)
  const suppressRevalidateUntilSeqRef = useRef<number>(0)
  const revalidateFnRef = useRef(revalidator.revalidate)
  const localSubmitInFlightRef = useRef(false)

  useEffect(() => {
    revalidateFnRef.current = revalidator.revalidate
  }, [revalidator.revalidate])

  useEffect(() => {
    latestSeqRef.current = snapshot.latestSeq
  }, [snapshot.latestSeq])

  useEffect(() => {
    if (fetcher.data?.ok !== true) return
    if (fetcher.data.acceptedSeqMax == null) return
    suppressRevalidateUntilSeqRef.current = Math.max(suppressRevalidateUntilSeqRef.current, fetcher.data.acceptedSeqMax)
  }, [fetcher.data])

  useEffect(() => {
    localSubmitInFlightRef.current = fetcher.state !== 'idle'
  }, [fetcher.state])

  useEffect(() => {
    const stream = new EventSource(`/api/m/${snapshot.matchId}/stream?since=${latestSeqRef.current}`)

    const onReady = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      let decoded: unknown
      try {
        decoded = JSON.parse(event.data)
      } catch {
        return
      }
      const parsed = StreamReadySchema.safeParse(decoded)
      if (!parsed.success) return
      if (parsed.data.latestSeq > latestSeqRef.current) {
        latestSeqRef.current = parsed.data.latestSeq
        if (!localSubmitInFlightRef.current && parsed.data.latestSeq > suppressRevalidateUntilSeqRef.current) {
          revalidateFnRef.current()
        }
      }
    }

    const onEvent = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      let decoded: unknown
      try {
        decoded = JSON.parse(event.data)
      } catch {
        return
      }
      const parsed = StreamEventSchema.safeParse(decoded)
      if (!parsed.success) return

      if (parsed.data.seq > latestSeqRef.current) {
        latestSeqRef.current = parsed.data.seq
        if (!localSubmitInFlightRef.current && parsed.data.seq > suppressRevalidateUntilSeqRef.current) {
          revalidateFnRef.current()
        }
      }
    }

    stream.addEventListener('ready', onReady)
    stream.addEventListener('ev', onEvent)
    return () => {
      stream.removeEventListener('ready', onReady)
      stream.removeEventListener('ev', onEvent)
      stream.close()
    }
  }, [snapshot.matchId])

  const decisions = deriveMatchLifecycleDecisions(snapshot)
  const frameIndex = snapshot.currentFrameIndex
  const Renderer = resolveControlRenderer(snapshot.gameKey)
  const isSubmitting = fetcher.state === 'submitting'

  function submitControlCommand(args: { commandType: string; command: Record<string, unknown> }) {
    localSubmitInFlightRef.current = true
    fetcher.submit(
      {
        actionType: 'game-command',
        gameKey: snapshot.gameKey,
        commandType: args.commandType,
        commandJson: JSON.stringify(args.command),
        frameIndex: String(frameIndex),
      },
      { method: 'post' },
    )
  }

  return (
    <main className="mx-auto flex flex-1 flex-col bg-surface lg:w-4xl">
      <ScoreBox
        nameA={participants.A.displayName}
        nameB={participants.B.displayName}
        matchScore={snapshot.framesWonBySeat}
        frameScore={snapshot.frames[snapshot.currentFrameIndex - 1].pointsBySeat}
        matchStatus={snapshot.status}
        frameIndex={frameIndex}
        targetFrames={snapshot.targets.matchTargetFrames}
      />

      <div className="flex flex-col gap-3 px-4 py-3">
        <Renderer
          projection={controlProjection}
          snapshot={snapshot}
          participants={participants}
          submitting={isSubmitting}
          onSubmitCommand={submitControlCommand}
        />

        {decisions.canStartNextFrame ? (
          <Button
            type="button"
            variant="secondary"
            className="h-auto justify-start rounded-xl px-4 py-3 text-left text-sm"
            disabled={isSubmitting}
            onClick={() => {
              localSubmitInFlightRef.current = true
              fetcher.submit({ actionType: 'start-next-frame', frameIndex: String(frameIndex) }, { method: 'post' })
            }}
          >
            {t(keys.match.control.startNextFrame)}
          </Button>
        ) : null}

        {decisions.canEndMatch ? (
          <Button
            type="button"
            variant="secondary"
            className="h-auto justify-start rounded-xl px-4 py-3 text-left text-sm"
            disabled={isSubmitting}
            onClick={() => {
              localSubmitInFlightRef.current = true
              fetcher.submit({ actionType: 'end-match', frameIndex: String(frameIndex) }, { method: 'post' })
            }}
          >
            {t(keys.match.control.endMatch)}
          </Button>
        ) : null}

        {fetcher.data?.ok === false ? (
          <p className="text-sm text-destructive">{fetcher.data.errorKey ? t(fetcher.data.errorKey) : fetcher.data.error}</p>
        ) : null}
      </div>

      <nav className="sticky bottom-0 z-10 mt-auto flex border-t border-border bg-background px-4">
        <span className="-mt-px flex-1 border-t-2 border-primary py-2.5 text-center text-sm font-medium text-foreground">
          {t(keys.match.sparring.tabControl)}
        </span>
        <Link
          to={`/sparring/matches/${snapshot.matchId}/protocol`}
          className="-mt-px flex-1 border-t-2 border-transparent py-2.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t(keys.match.sparring.tabProtocol)}
        </Link>
      </nav>
    </main>
  )
}

import { applyMatchEvent, deriveMatchLifecycleDecisions, emptyMatchState } from '@ks/competition'
import {
  ClientIdSchema,
  type ClientEvent,
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
  type StoredEvent,
} from '@ks/core'
import { GameControlProjectionSchema, isRegisteredGameKey, registry, type RegisteredGameKey } from '@ks/gameplay'
import { keys } from '@ks/i18n'
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@ks/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher, useLoaderData, useRevalidator } from 'react-router'
import { z } from 'zod'

import {
  resolveControlRenderer,
  type GameControlProjection,
  type HydratedMatchParticipants,
} from '../features/match-control/renderers'
import type { AppLoadContext } from '../server/context'
import { requireEnv } from '../server/context'
import { localeFromCookie } from '../server/locale'
import { fetchMatchSnapshot, getMatchControlSecret, listStoredEvents, postMatchEvents } from '../server/match-room'

type LoaderData = {
  snapshot: Awaited<ReturnType<typeof parseSnapshotBody>>['snapshot']
  participants: HydratedMatchParticipants
  controlProjection: GameControlProjection
  protocolEntries: StoredEvent[]
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
  const protocolEntries = await listStoredEvents(env, matchId)
  const { gameKey } = body.snapshot
  const gameTitle = isRegisteredGameKey(gameKey) ? registry[gameKey].meta.title[locale] : gameKey

  return {
    snapshot: body.snapshot,
    participants: body.participants,
    controlProjection: body.controlProjection ?? emptyControlProjection(gameKey),
    protocolEntries,
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

function protocolLabel(event: StoredEvent, seatNames: { A: string; B: string }): string {
  const seatLabel = (seat: 'A' | 'B') => seatNames[seat]

  if (event.type === 'game.command') {
    if (event.payload.commandType === 'pot.record') {
      const command = event.payload.command as { actor?: unknown; seat?: unknown; points?: unknown; pottedBalls?: unknown }

      if (Array.isArray(command.pottedBalls)) {
        const actor = command.actor === 'A' || command.actor === 'B' ? command.actor : '?'
        const pottedBalls = command.pottedBalls
          .filter((ball): ball is number => typeof ball === 'number')
          .map((ball) => {
            if (ball === 0) return 'cue'
            if (ball === 1) return 'red'
            if (ball === 2) return 'yellow'
            if (ball === 3) return 'green'
            if (ball === 4) return 'brown'
            if (ball === 5) return 'blue'
            if (ball === 6) return 'pink'
            if (ball === 7) return 'black'
            return String(ball)
          })
        const summary = pottedBalls.length > 0 ? pottedBalls.join(', ') : 'none'
        const actorLabel = actor === 'A' || actor === 'B' ? seatLabel(actor) : actor
        return `${actorLabel}: pot (${summary})`
      }

      const seat = command.seat
      const points = typeof command.points === 'number' ? command.points : null
      const seatText = seat === 'A' || seat === 'B' ? seatLabel(seat) : '?'
      if (points != null) {
        const signed = points >= 0 ? `+${points}` : String(points)
        return `${seatText}: pot ${signed}`
      }
      return `${seatText}: pot`
    }

    const command = event.payload.command as { actor?: unknown; seat?: unknown }
    const actor = command.actor
    if (actor === 'A' || actor === 'B') {
      return `${seatLabel(actor)}: ${event.payload.commandType}`
    }
    const seat = command.seat
    if (seat === 'A' || seat === 'B') {
      return `${seatLabel(seat)}: ${event.payload.commandType}`
    }
    return event.payload.commandType
  }
  if (event.type === 'frame.started') {
    return `Frame ${event.payload.frameIndex} started`
  }
  if (event.type === 'frame.awarded') {
    return `${seatLabel(event.payload.winnerSeat)}: frame awarded`
  }
  if (event.type === 'match.ended') {
    return 'Match ended'
  }
  return event.type
}

type ProtocolRow = {
  entry: StoredEvent
  label: string
  score: { A: number; B: number }
}

function deriveProtocolRows(entries: StoredEvent[], seatNames: { A: string; B: string }): ProtocolRow[] {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq)
  let state = emptyMatchState()

  return ordered.map((entry) => {
    const { seq: _seq, receivedAt: _receivedAt, ...clientEvent } = entry
    state = applyMatchEvent(state, clientEvent as ClientEvent)

    const currentFrame = state.frames[state.frames.length - 1]
    const score = currentFrame?.pointsBySeat ?? { A: 0, B: 0 }

    return {
      entry,
      label: protocolLabel(entry, seatNames),
      score,
    }
  })
}

function ProtocolPanel(props: { rows: ProtocolRow[]; emptyLabel: string }) {
  if (props.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{props.emptyLabel}</p>
  }

  return (
    <div className="grid gap-2">
      {props.rows.map((row) => (
        <div
          key={`${row.entry.seq}-${row.entry.eventId}`}
          className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 text-sm"
        >
          <span className="flex min-w-0 flex-col">
            <span>{row.label}</span>
            <span className="text-xs text-muted-foreground">
              {row.score.A}:{row.score.B}
            </span>
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {new Date(row.entry.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        </div>
      ))}
    </div>
  )
}

export const handle = {
  headerConfig: (data: LoaderData) => ({
    title: `Спаринг: ${data.gameTitle}`,
    backTo: '/sparring/matches',
  }),
}

export default function SparringMatchRoute() {
  const { t } = useTranslation()
  const { snapshot, participants, controlProjection, protocolEntries: initialProtocolEntries } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()

  const [protocolEntries, setProtocolEntries] = useState<StoredEvent[]>(initialProtocolEntries)
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
    if (snapshot.status !== 'active') return

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

      setProtocolEntries((prev) => {
        if (prev.some((entry) => entry.eventId === parsed.data.eventId)) return prev
        return [...prev, parsed.data]
      })

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
  }, [snapshot.matchId, snapshot.status])

  const decisions = deriveMatchLifecycleDecisions(snapshot)
  const frameIndex = snapshot.currentFrameIndex
  const Renderer = resolveControlRenderer(snapshot.gameKey)
  const isSubmitting = fetcher.state === 'submitting'
  const seatNames = useMemo(
    () => ({
      A: participants.A.displayName,
      B: participants.B.displayName,
    }),
    [participants.A.displayName, participants.B.displayName],
  )
  const protocolRows = useMemo(() => {
    const rows = deriveProtocolRows(protocolEntries, seatNames)
    return snapshot.status === 'active' ? [...rows].reverse() : rows
  }, [protocolEntries, seatNames, snapshot.status])
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
    <main className="flex flex-1 flex-col bg-background text-foreground">
      {/* Score strip */}
      <div className="sticky top-14 z-10 border-b border-border bg-background px-4 pt-4 pb-3">
        <div className="mb-2 text-center text-xs text-muted-foreground tabular-nums">
          {snapshot.framesWonBySeat.A} : {snapshot.framesWonBySeat.B}&ensp;·&ensp;
          {t(keys.match.scoreboard.frame)} {frameIndex}&ensp;·&ensp; до {snapshot.targets.matchTargetFrames} перемог
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className="line-clamp-2 text-sm font-medium">{participants.A.displayName}</span>
          <span className="text-5xl font-bold tracking-tight tabular-nums">
            {controlProjection.score.A}&thinsp;:&thinsp;{controlProjection.score.B}
          </span>
          <span className="line-clamp-2 text-right text-sm font-medium">{participants.B.displayName}</span>
        </div>
      </div>

      {/* Tabbed control / protocol — tab bar is at the bottom */}
      <Tabs defaultValue="control" className="flex flex-1 flex-col">
        <TabsContent value="control" className="flex flex-col gap-3 px-4 py-3">
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
        </TabsContent>

        <TabsContent value="protocol" className="px-4 py-3 pb-12">
          <ProtocolPanel rows={protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
        </TabsContent>

        <TabsList className="sticky bottom-0 z-10 mt-auto border-t border-b-0 bg-background px-4">
          <TabsTrigger value="control" className="-mt-px mb-0 border-t-2 border-b-0">
            {t(keys.match.sparring.tabControl)}
          </TabsTrigger>
          <TabsTrigger value="protocol" className="-mt-px mb-0 border-t-2 border-b-0">
            {t(keys.match.sparring.tabProtocol)}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </main>
  )
}

import { applyMatchEvent, deriveMatchControlDecisions, emptyMatchState } from '@ks/competition'
import {
  ClientIdSchema,
  type ClientEvent,
  ClientEventSchema,
  FrameStartedEventSchema,
  GameCommandEventSchema,
  MatchEndedEventSchema,
  MatchIdSchema,
  newEventId,
  PostEventsResponseSchema,
  SnapshotResponseSchema,
  StreamEventSchema,
  StreamReadySchema,
  type StoredEvent,
} from '@ks/core'
import { isRegisteredGameKey, type RegisteredGameKey } from '@ks/gameplay'
import { keys } from '@ks/i18n'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@ks/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher, useLoaderData, useRevalidator } from 'react-router'

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
}

type ActionData =
  | { ok: true; acceptedSeqMax: number | null }
  | {
      ok: false
      error?: string
      errorKey?: typeof keys.match.control.invalidEventPayload | typeof keys.match.control.eventRejectedByRules
    }

function parseControlProjection(raw: unknown, gameKey: string): GameControlProjection {
  if (!raw || typeof raw !== 'object') {
    return {
      gameKey,
      projection: 'control',
      score: { A: 0, B: 0 },
      availableCommands: [],
    }
  }

  const candidate = raw as Partial<GameControlProjection>
  if (!Array.isArray(candidate.availableCommands)) {
    return {
      gameKey,
      projection: 'control',
      score: { A: 0, B: 0 },
      availableCommands: [],
    }
  }

  const availableCommands = candidate.availableCommands
    .filter((entry): entry is GameControlProjection['availableCommands'][number] => {
      if (!entry || typeof entry !== 'object') return false
      const commandType = (entry as { commandType?: unknown }).commandType
      const command = (entry as { command?: unknown }).command
      return typeof commandType === 'string' && Boolean(command) && typeof command === 'object'
    })
    .map((entry) => ({
      commandType: entry.commandType,
      command: entry.command,
      label: entry.label,
      effectSummary: entry.effectSummary,
      warning: entry.warning,
      helpText: entry.helpText,
    }))

  const score =
    candidate.score && typeof candidate.score.A === 'number' && typeof candidate.score.B === 'number'
      ? { A: candidate.score.A, B: candidate.score.B }
      : { A: 0, B: 0 }

  return {
    gameKey: typeof candidate.gameKey === 'string' ? candidate.gameKey : gameKey,
    projection: 'control',
    score,
    availableCommands,
    details: candidate.details,
  }
}

async function parseSnapshotBody(res: Response) {
  const body = SnapshotResponseSchema.parse(await res.json())
  if (!body.ok) {
    throw new Response(body.error, { status: 500 })
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

  const res = await fetchMatchSnapshot(env, matchId, localeFromCookie(request.headers.get('cookie')))
  const body = await parseSnapshotBody(res)
  const protocolEntries = await listStoredEvents(env, matchId)

  return {
    snapshot: body.snapshot,
    participants: body.participants,
    controlProjection: parseControlProjection(body.controlProjection, body.snapshot.gameKey),
    protocolEntries,
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
    if (event.payload.commandType === 'record-pot') {
      const command = event.payload.command as { actor?: unknown; pottedBalls?: unknown }
      const actor = command.actor === 'A' || command.actor === 'B' ? command.actor : '?'
      const pottedBalls = Array.isArray(command.pottedBalls)
        ? command.pottedBalls
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
        : []
      const summary = pottedBalls.length > 0 ? pottedBalls.join(', ') : 'none'
      const actorLabel = actor === 'A' || actor === 'B' ? seatLabel(actor) : actor
      return `${actorLabel}: pot (${summary})`
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
          <span className="text-xs text-muted-foreground">
            {new Date(row.entry.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function SparringMatchRoute() {
  const { t } = useTranslation()
  const { snapshot, participants, controlProjection, protocolEntries: initialProtocolEntries } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()

  const [mobileTab, setMobileTab] = useState<'control' | 'protocol'>('control')
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
  }, [snapshot.matchId])

  const decisions = deriveMatchControlDecisions(snapshot)
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
  const protocolRows = useMemo(() => deriveProtocolRows(protocolEntries, seatNames), [protocolEntries, seatNames])
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
    <main className="min-h-dvh flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t(keys.match.sparring.matchControlTitle)}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-sm text-muted-foreground">{participants.A.displayName}</div>
                <div className="text-4xl font-semibold tabular-nums">{controlProjection.score.A}</div>
              </div>
              <div className="rounded-lg border border-border p-3 text-right">
                <div className="text-sm text-muted-foreground">{participants.B.displayName}</div>
                <div className="text-4xl font-semibold tabular-nums">{controlProjection.score.B}</div>
              </div>
            </div>

            <div className="grid gap-1 text-sm text-muted-foreground">
              <div>
                Match: {snapshot.framesWonBySeat.A}:{snapshot.framesWonBySeat.B} (to {snapshot.targets.matchTargetFrames})
              </div>
              <div>
                {t(keys.match.scoreboard.frame)} {frameIndex}
              </div>
            </div>

            <div className="grid gap-2 md:hidden">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mobileTab === 'control' ? 'secondary' : 'outline'}
                  onClick={() => setMobileTab('control')}
                >
                  {t(keys.match.sparring.tabControl)}
                </Button>
                <Button
                  type="button"
                  variant={mobileTab === 'protocol' ? 'secondary' : 'outline'}
                  onClick={() => setMobileTab('protocol')}
                >
                  {t(keys.match.sparring.tabProtocol)}
                </Button>
              </div>
            </div>

            <div className={mobileTab === 'control' ? 'md:min-h-[24rem]' : 'hidden md:block md:min-h-[24rem]'}>
              <Renderer
                projection={controlProjection}
                snapshot={snapshot}
                participants={participants}
                decisions={decisions}
                submitting={isSubmitting}
                onSubmitCommand={submitControlCommand}
              />
            </div>

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
              <div className="text-sm text-destructive">
                {fetcher.data.errorKey ? t(fetcher.data.errorKey) : fetcher.data.error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={mobileTab === 'protocol' ? '' : 'hidden md:block'}>
          <CardHeader>
            <CardTitle>{t(keys.match.sparring.protocolTitle)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProtocolPanel rows={protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

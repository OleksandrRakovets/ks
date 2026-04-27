import { applyMatchEvent, emptyMatchState } from '@ks/competition'
import {
  type ClientEvent,
  ErrorResponseSchema,
  HydratedMatchParticipantsSchema,
  MatchSnapshotSchema,
  StreamEventSchema,
  StreamReadySchema,
  type StoredEvent,
  type BySeatNumber,
  type Seat,
} from '@ks/core'
import { isRegisteredGameKey, registry } from '@ks/gameplay'
import { keys } from '@ks/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData, useRevalidator } from 'react-router'
import { z } from 'zod'

import type { HydratedMatchParticipants } from '../../features/match-control/renderers'
import type { AppLoadContext } from '../../server/context'
import { requireEnv } from '../../server/context'
import { localeFromCookie } from '../../server/locale'
import { fetchMatchSnapshot, listStoredEvents } from '../../server/match-room'
import { ScoreBox } from './score-box'

type LoaderData = {
  snapshot: Awaited<ReturnType<typeof parseSnapshotBody>>['snapshot']
  participants: HydratedMatchParticipants
  protocolEntries: StoredEvent[]
  gameTitle: string
}

const SnapshotResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    snapshot: MatchSnapshotSchema,
    participants: HydratedMatchParticipantsSchema,
  }),
  ErrorResponseSchema,
])

async function parseSnapshotBody(res: Response) {
  const body = SnapshotResponseSchema.parse(await res.json())
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
    protocolEntries,
    gameTitle,
  }
}

function protocolLabel(event: StoredEvent, seatNames: { A: string; B: string }): string {
  const seatLabel = (seat: Seat) => seatNames[seat]

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
  score: BySeatNumber
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
    title: `Протокол: ${data.gameTitle}`,
    backTo: data.snapshot.status === 'active' ? `/sparring/matches/${data.snapshot.matchId}` : '/sparring/matches',
  }),
}

export default function SparringMatchProtocolRoute() {
  const { t } = useTranslation()
  const { snapshot, participants, protocolEntries: initialProtocolEntries } = useLoaderData<typeof loader>()
  const revalidator = useRevalidator()

  const [protocolEntries, setProtocolEntries] = useState<StoredEvent[]>(initialProtocolEntries)
  const latestSeqRef = useRef(snapshot.latestSeq)
  const revalidateFnRef = useRef(revalidator.revalidate)

  useEffect(() => {
    revalidateFnRef.current = revalidator.revalidate
  }, [revalidator.revalidate])

  useEffect(() => {
    latestSeqRef.current = snapshot.latestSeq
  }, [snapshot.latestSeq])

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
        revalidateFnRef.current()
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
        revalidateFnRef.current()
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

  const frameIndex = snapshot.currentFrameIndex
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

  return (
    <main className="mx-auto flex flex-1 flex-col bg-surface lg:w-4xl">
      <ScoreBox
        nameA={participants.A.displayName}
        nameB={participants.B.displayName}
        matchScore={snapshot.framesWonBySeat}
        frameScore={snapshot.frames[frameIndex - 1].pointsBySeat}
        matchStatus={snapshot.status}
        frameIndex={frameIndex}
        targetFrames={snapshot.targets.matchTargetFrames}
      />

      <div className="px-4 py-3 pb-12">
        <ProtocolPanel rows={protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
      </div>

      {snapshot.status === 'active' ? (
        <nav className="sticky bottom-0 z-10 mt-auto flex border-t border-border bg-background px-4">
          <Link
            to={`/sparring/matches/${snapshot.matchId}`}
            className="-mt-px flex-1 border-t-2 border-transparent py-2.5 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t(keys.match.sparring.tabControl)}
          </Link>
          <span className="-mt-px flex-1 border-t-2 border-primary py-2.5 text-center text-sm font-medium text-foreground">
            {t(keys.match.sparring.tabProtocol)}
          </span>
        </nav>
      ) : null}
    </main>
  )
}

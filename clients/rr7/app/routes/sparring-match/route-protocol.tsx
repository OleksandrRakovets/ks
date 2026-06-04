import {
  ErrorResponseSchema,
  HydratedMatchParticipantsSchema,
  MatchSnapshotSchema,
  StreamFactSchema,
  StreamReadySchema,
} from '@ks/core'
import { GameControlProjectionSchema, isRegisteredGameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData, useRevalidator } from 'react-router'
import { z } from 'zod'

import type { ProtocolRow } from '../../../domain/protocol/reader'
import type { HydratedMatchParticipants } from '../../features/match-control/renderers'
import type { AppLoadContext } from '../../server/context'
import { requireEnv } from '../../server/context'
import { localeFromCookie } from '../../server/locale'
import { fetchMatchSnapshot } from '../../server/match-room'
import { readProtocolHistory } from '../../server/protocol-history'
import { ScoreBox } from './score-box'

type LoaderData = {
  snapshot: Awaited<ReturnType<typeof parseSnapshotBody>>['snapshot']
  participants: HydratedMatchParticipants
  controlProjection?: Awaited<ReturnType<typeof parseSnapshotBody>>['controlProjection']
  protocolRows: ProtocolRow[]
  gameTitle: string
}

const SnapshotResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    snapshot: MatchSnapshotSchema,
    participants: HydratedMatchParticipantsSchema,
    controlProjection: GameControlProjectionSchema.optional(),
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
  const { gameKey } = body.snapshot
  const gameTitle = isRegisteredGameKey(gameKey) ? registry[gameKey].meta.title[locale] : gameKey

  const protocolRows = await readProtocolHistory(
    env,
    matchId,
    body.snapshot.status,
    {
      A: body.participants.A.displayName,
      B: body.participants.B.displayName,
    },
    'UTC',
  )

  return {
    snapshot: body.snapshot,
    participants: body.participants,
    controlProjection: body.controlProjection,
    protocolRows,
    gameTitle,
  }
}

function ProtocolPanel(props: { rows: ProtocolRow[]; emptyLabel: string }) {
  if (props.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{props.emptyLabel}</p>
  }

  return (
    <div className="grid gap-2">
      {props.rows.map((row) => (
        <div key={row.key} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 text-sm">
          <span className="flex min-w-0 flex-col">
            <span>{row.label}</span>
            {row.score ? <span className="text-xs text-muted-foreground">{`${row.score.A}:${row.score.B}`}</span> : null}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            <time dateTime={new Date(row.receivedAt).toISOString()}>{row.timeLabel}</time>
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
  const { snapshot, participants, controlProjection, protocolRows } = useLoaderData<typeof loader>()
  const revalidator = useRevalidator()

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
      const parsed = StreamFactSchema.safeParse(decoded)
      if (!parsed.success) return

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
  const snapshotFrame = snapshot.frames[frameIndex - 1]
  return (
    <main className="flex flex-1 flex-col bg-surface">
      <ScoreBox
        nameA={participants.A.displayName}
        nameB={participants.B.displayName}
        matchScore={snapshot.framesWonBySeat}
        frameScore={controlProjection?.score ?? snapshotFrame?.pointsBySeat ?? { A: 0, B: 0 }}
        matchStatus={snapshot.status}
        frameIndex={frameIndex}
        targetFrames={snapshot.targets.matchTargetFrames}
      />

      <div className="px-4 py-3 pb-12">
        <ProtocolPanel rows={protocolRows} emptyLabel={t(keys.match.sparring.protocolEmpty)} />
      </div>

      {snapshot.status === 'active' ? (
        <nav className="sticky bottom-0 z-10 mt-auto flex border-t border-border bg-background">
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

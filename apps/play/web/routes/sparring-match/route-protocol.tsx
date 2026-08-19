import {
  ErrorResponseSchema,
  HydratedMatchParticipantsSchema,
  MatchSnapshotSchema,
  StreamFactSchema,
  StreamReadySchema,
} from '@ks/core'
import { GameControlProjectionSchema, isRegisteredGameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData, useRevalidator } from 'react-router'
import * as v from 'valibot'

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

const SnapshotResponseSchema = v.union([
  v.object({
    ok: v.literal(true),
    snapshot: MatchSnapshotSchema,
    participants: HydratedMatchParticipantsSchema,
    controlProjection: v.optional(GameControlProjectionSchema),
  }),
  ErrorResponseSchema,
])

const StreamReadyEventSchema = v.pipe(v.string(), v.parseJson(), StreamReadySchema)
const StreamFactEventSchema = v.pipe(v.string(), v.parseJson(), StreamFactSchema)

async function parseSnapshotBody(res: Response) {
  const body = v.parse(SnapshotResponseSchema, await res.json())
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
    locale,
  )

  return {
    snapshot: body.snapshot,
    participants: body.participants,
    controlProjection: body.controlProjection,
    protocolRows,
    gameTitle,
  }
}

function protocolBallLabel(t: TFunction, ball: number): string {
  switch (ball) {
    case 0:
      return t('match.protocol.balls.0')
    case 1:
      return t('match.protocol.balls.1')
    case 2:
      return t('match.protocol.balls.2')
    case 3:
      return t('match.protocol.balls.3')
    case 4:
      return t('match.protocol.balls.4')
    case 5:
      return t('match.protocol.balls.5')
    case 6:
      return t('match.protocol.balls.6')
    case 7:
      return t('match.protocol.balls.7')
    default:
      return t('match.protocol.balls.none')
  }
}

function protocolLabel(t: TFunction, row: ProtocolRow): string {
  const balls = row.message.pottedBalls
    ? row.message.pottedBalls.map((ball) => protocolBallLabel(t, ball)).join(', ')
    : t('match.protocol.balls.none')
  return t(row.message.key, { ...row.message.params, balls })
}

function ProtocolPanel(props: { rows: ProtocolRow[]; emptyLabel: string }) {
  const { t } = useTranslation()
  const rows = props.rows.map((row) => ({ ...row, label: protocolLabel(t, row) }))
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{props.emptyLabel}</p>
  }

  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 text-sm">
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-baseline gap-2">
              {row.message.actor ? <span className="shrink-0 font-medium">{row.message.actor}</span> : null}
              <span>{row.label}</span>
            </span>
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
    titleKey: keys.match.sparring.protocolHeaderTitle,
    titleParams: { gameTitle: data.gameTitle },
    backTo: data.snapshot.status === 'active' ? `/sparring/matches/${data.snapshot.matchId}/` : '/sparring/matches/',
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

    const stream = new EventSource(`/api/m/${snapshot.matchId}/stream/?since=${latestSeqRef.current}`)

    const onReady = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const parsed = v.safeParse(StreamReadyEventSchema, event.data)
      if (!parsed.success) return
      if (parsed.output.latestSeq > latestSeqRef.current) {
        latestSeqRef.current = parsed.output.latestSeq
        revalidateFnRef.current()
      }
    }

    const onEvent = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const parsed = v.safeParse(StreamFactEventSchema, event.data)
      if (!parsed.success) return

      if (parsed.output.seq > latestSeqRef.current) {
        latestSeqRef.current = parsed.output.seq
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
        <nav className="sticky bottom-0 z-10 mt-auto flex h-14 border-t border-border bg-background">
          <Link
            to={`/sparring/matches/${snapshot.matchId}/`}
            className="-mt-px flex flex-1 items-center justify-center border-t-2 border-transparent text-center text-base font-medium text-muted-foreground hover:text-foreground"
          >
            {t(keys.match.sparring.tabControl)}
          </Link>
          <span className="-mt-px flex flex-1 items-center justify-center border-t-2 border-primary text-center text-base font-medium text-foreground">
            {t(keys.match.sparring.tabProtocol)}
          </span>
        </nav>
      ) : null}
    </main>
  )
}

import {
  ControlCommandSectionsSchema,
  ControlCommandSchema,
  ErrorResponseSchema,
  HydratedMatchParticipantsSchema,
  MatchSnapshotSchema,
  PostFactsResponseSchema,
  StreamFactSchema,
  StreamReadySchema,
  emptyControlCommandSections,
  type ControlCommandSections,
  type ControlCommandPreset,
} from '@ks/core'
import { GameControlProjectionSchema, isRegisteredGameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
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
import { fetchMatchSnapshot, getMatchControlSecret, postMatchFacts } from '../../server/match-room'
import { ScoreBox } from './score-box'

type LoaderData = {
  snapshot: Awaited<ReturnType<typeof parseSnapshotBody>>['snapshot']
  participants: HydratedMatchParticipants
  controlProjection: GameControlProjection
  controlSections: ControlCommandSections
  gameTitle: string
}

type ActionData =
  | { ok: true; acceptedSeqMax: number | null }
  | {
      ok: false
      error?: string
      errorKey?: typeof keys.match.control.invalidFactPayload | typeof keys.match.control.factRejectedByRules
    }

const SnapshotResponseWithControlSchema = z.union([
  z.object({
    ok: z.literal(true),
    snapshot: MatchSnapshotSchema,
    participants: HydratedMatchParticipantsSchema,
    controlProjection: GameControlProjectionSchema.optional(),
    controlSections: ControlCommandSectionsSchema.optional(),
  }),
  ErrorResponseSchema,
])

function emptyControlProjection(gameKey: string): GameControlProjection {
  return {
    gameKey,
    projection: 'control',
    score: { A: 0, B: 0 },
    details: {
      commandSections: emptyControlCommandSections(),
    },
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
    controlSections: body.controlSections ?? emptyControlCommandSections(),
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
  let command: unknown

  if (actionType === 'control-command') {
    const source = String(form.get('source') ?? '')
    const commandType = String(form.get('commandType') ?? '')
    const rawCommandJson = String(form.get('commandJson') ?? '{}')
    let parsedCommand: unknown
    try {
      parsedCommand = JSON.parse(rawCommandJson)
    } catch {
      return { ok: false, errorKey: keys.match.control.invalidFactPayload }
    }

    command = { source, commandType, command: parsedCommand ?? {} }
  } else {
    const gameKey = String(form.get('gameKey') ?? '')
    const commandType = String(form.get('commandType') ?? '')
    const rawCommandJson = String(form.get('commandJson') ?? '{}')
    let parsedCommand: unknown
    try {
      parsedCommand = JSON.parse(rawCommandJson)
    } catch {
      return { ok: false, errorKey: keys.match.control.invalidFactPayload }
    }

    if (!isRegisteredGameKey(gameKey)) {
      return { ok: false, errorKey: keys.match.control.invalidFactPayload }
    }

    command = { source: 'game', commandType, command: parsedCommand ?? {} }
  }

  const parsedCommand = ControlCommandSchema.safeParse(command)
  if (!parsedCommand.success) {
    return { ok: false, errorKey: keys.match.control.invalidFactPayload }
  }

  const res = await postMatchFacts(env, matchId, controlSecret, [parsedCommand.data])
  const payload = PostFactsResponseSchema.parse(await res.json())
  if (!payload.ok) {
    return { ok: false, error: payload.error }
  }
  if (payload.accepted.length === 0) {
    return { ok: false, errorKey: keys.match.control.factRejectedByRules }
  }

  const acceptedSeqMax = payload.accepted.reduce<number | null>((max, entry) => {
    if (max == null) return entry.seq
    return Math.max(max, entry.seq)
  }, null)

  return { ok: true, acceptedSeqMax }
}

export const handle = {
  headerConfig: (data: LoaderData) => ({
    titleKey: keys.match.sparring.controlHeaderTitle,
    titleParams: { gameTitle: data.gameTitle },
    backTo: '/sparring/matches',
  }),
}

export default function SparringMatchRoute() {
  const { t } = useTranslation()
  const { snapshot, participants, controlProjection, controlSections } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()

  const latestSeqRef = useRef(snapshot.latestSeq)
  const suppressRevalidateUntilSeqRef = useRef<number>(snapshot.latestSeq)
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
      const parsed = StreamFactSchema.safeParse(decoded)
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

  const Renderer = resolveControlRenderer(snapshot.gameKey)
  const isSubmitting = fetcher.state === 'submitting'
  const snapshotFrame = snapshot.frames[snapshot.currentFrameIndex - 1]
  const frameScore = snapshotFrame?.winnerSeat ? snapshotFrame.pointsBySeat : controlProjection.score
  const safeControlSections = controlSections ?? emptyControlCommandSections()

  function submitPreset(command: ControlCommandPreset) {
    localSubmitInFlightRef.current = true
    fetcher.submit(
      {
        actionType: 'control-command',
        source: command.source,
        commandType: command.commandType,
        commandJson: JSON.stringify(command.command),
      },
      { method: 'post' },
    )
  }

  return (
    <main className="flex flex-1 flex-col bg-surface">
      <ScoreBox
        nameA={participants.A.displayName}
        nameB={participants.B.displayName}
        matchScore={snapshot.framesWonBySeat}
        frameScore={frameScore}
        matchStatus={snapshot.status}
        frameIndex={snapshot.currentFrameIndex}
        targetFrames={snapshot.targets.matchTargetFrames}
      />

      <section aria-label="Per-game control container" className="flex flex-col">
        <Renderer
          projection={controlProjection}
          commandSections={safeControlSections}
          snapshot={snapshot}
          participants={participants}
          submitting={isSubmitting}
          onSubmitCommand={submitPreset}
        />

        {fetcher.data?.ok === false ? (
          <p className="text-sm text-destructive">{fetcher.data.errorKey ? t(fetcher.data.errorKey) : fetcher.data.error}</p>
        ) : null}
      </section>

      <nav className="sticky bottom-0 z-10 mt-auto flex border-t border-border bg-background">
        <span className="-mt-px flex-1 border-t-2 border-primary py-2.5 text-center text-sm font-medium text-foreground">
          {t(keys.match.sparring.tabControl)}
        </span>
        <Link
          to={`/sparring/matches/${snapshot.matchId}/protocol`}
          className="-mt-px flex-1 border-t-2 border-transparent py-2.5 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {t(keys.match.sparring.tabProtocol)}
        </Link>
      </nav>
    </main>
  )
}

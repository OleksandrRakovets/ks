import {
  ControlCommandSchema,
  CommandIdSchema,
  StreamFactSchema,
  StreamReadySchema,
  UnknownObjectSchema,
  emptyControlCommandSections,
  type ControlCommandSections,
  type ControlCommandPreset,
  newCommandId,
  type MatchSnapshot,
} from '@ks/core'
import { isRegisteredGameKey, registry, type GameControlProjection } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, redirect, useFetcher, useLoaderData, useRevalidator } from 'react-router'
import * as v from 'valibot'

import { resolveControlRenderer, type HydratedMatchParticipants } from '../../features/match-control/renderers'
import type { AppLoadContext } from '../../server/context'
import { requireApplication } from '../../server/context'
import { localeFromCookie } from '../../server/locale'
import { ScoreBox } from './score-box'

type LoaderData = {
  snapshot: MatchSnapshot
  participants: HydratedMatchParticipants
  controlProjection: GameControlProjection
  controlSections: ControlCommandSections
  gameTitle: string
}

type ActionErrorKey =
  | typeof keys.match.control.invalidFactPayload
  | typeof keys.match.control.factRejectedByRules
  | typeof keys.match.control.unknownMatch
  | typeof keys.match.control.matchLocked

type ActionData = { ok: true; acceptedSeqMax: number | null } | { ok: false; errorKey: ActionErrorKey }

const CommandJsonSchema = v.pipe(v.string(), v.parseJson(), UnknownObjectSchema)
const StreamReadyEventSchema = v.pipe(v.string(), v.parseJson(), StreamReadySchema)
const StreamFactEventSchema = v.pipe(v.string(), v.parseJson(), StreamFactSchema)

function postFactsErrorKey(error: string): ActionErrorKey {
  if (error === 'unknown-match') return keys.match.control.unknownMatch
  if (error === 'match-locked') return keys.match.control.matchLocked
  return keys.match.control.invalidFactPayload
}

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

export async function loader({
  params,
  request,
  context,
}: {
  params: { matchId?: string }
  request: Request
  context: AppLoadContext
}): Promise<LoaderData> {
  const application = requireApplication(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const locale = localeFromCookie(request.headers.get('cookie'))
  const result = await application.readMatch(matchId, locale)
  if (!result.ok) throw new Response(result.error, { status: result.status })

  if (result.snapshot.status !== 'active') {
    throw redirect(`/sparring/matches/${matchId}/protocol/`)
  }

  const { gameKey } = result.snapshot
  const gameTitle = isRegisteredGameKey(gameKey) ? registry[gameKey].meta.title[locale] : gameKey

  return {
    snapshot: result.snapshot,
    participants: result.participants,
    controlProjection: result.controlProjection ?? emptyControlProjection(gameKey),
    controlSections: result.controlSections ?? emptyControlCommandSections(),
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
  const application = requireApplication(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const form = await request.formData()
  const actionType = String(form.get('actionType') ?? 'game-command')
  let command: unknown

  if (actionType === 'control-command') {
    const source = String(form.get('source') ?? '')
    const commandType = String(form.get('commandType') ?? '')
    const rawCommandJson = String(form.get('commandJson') ?? '{}')
    const parsedCommand = v.safeParse(CommandJsonSchema, rawCommandJson)
    if (!parsedCommand.success) {
      return { ok: false, errorKey: keys.match.control.invalidFactPayload }
    }

    // oxlint-disable-next-line anti-slop/no-known-value-widening -- SAFETY: REVIEW_POST_REFACTOR
    command = { source, commandType, command: parsedCommand.output }
  } else {
    const gameKey = String(form.get('gameKey') ?? '')
    const commandType = String(form.get('commandType') ?? '')
    const rawCommandJson = String(form.get('commandJson') ?? '{}')
    const parsedCommand = v.safeParse(CommandJsonSchema, rawCommandJson)
    if (!parsedCommand.success) {
      return { ok: false, errorKey: keys.match.control.invalidFactPayload }
    }

    if (!isRegisteredGameKey(gameKey)) {
      return { ok: false, errorKey: keys.match.control.invalidFactPayload }
    }

    // oxlint-disable-next-line anti-slop/no-known-value-widening -- SAFETY: REVIEW_POST_REFACTOR
    command = { source: 'game', commandType, command: parsedCommand.output }
  }

  const parsedCommand = v.safeParse(ControlCommandSchema, command)
  if (!parsedCommand.success) {
    return { ok: false, errorKey: keys.match.control.invalidFactPayload }
  }

  const commandId = v.safeParse(CommandIdSchema, form.get('commandId'))
  if (!commandId.success) return { ok: false, errorKey: keys.match.control.invalidFactPayload }
  const result = await application.commandMatch(matchId, commandId.output, [parsedCommand.output])
  if (!result.ok) {
    return { ok: false, errorKey: postFactsErrorKey(result.error) }
  }
  if (result.accepted.length === 0) {
    return { ok: false, errorKey: keys.match.control.factRejectedByRules }
  }

  const acceptedSeqMax = result.accepted.reduce<number | null>((max, entry) => {
    if (max == null) return entry.seq
    return Math.max(max, entry.seq)
  }, null)

  return { ok: true, acceptedSeqMax }
}

export const handle = {
  headerConfig: (data: LoaderData) => ({
    titleKey: keys.match.sparring.controlHeaderTitle,
    titleParams: { gameTitle: data.gameTitle },
    backTo: '/sparring/matches/',
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
    const stream = new EventSource(`/api/m/${snapshot.matchId}/stream/?since=${latestSeqRef.current}`)

    const onReady = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const parsed = v.safeParse(StreamReadyEventSchema, event.data)
      if (!parsed.success) return
      if (parsed.output.latestSeq > latestSeqRef.current) {
        latestSeqRef.current = parsed.output.latestSeq
        if (!localSubmitInFlightRef.current && parsed.output.latestSeq > suppressRevalidateUntilSeqRef.current) {
          revalidateFnRef.current()
        }
      }
    }

    const onEvent = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const parsed = v.safeParse(StreamFactEventSchema, event.data)
      if (!parsed.success) return

      if (parsed.output.seq > latestSeqRef.current) {
        latestSeqRef.current = parsed.output.seq
        if (!localSubmitInFlightRef.current && parsed.output.seq > suppressRevalidateUntilSeqRef.current) {
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
        commandId: newCommandId(),
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

      <section aria-label={t(keys.match.control.perGameContainer)} className="flex flex-col">
        <Renderer
          projection={controlProjection}
          commandSections={safeControlSections}
          snapshot={snapshot}
          participants={participants}
          submitting={isSubmitting}
          onSubmitCommand={submitPreset}
        />

        {fetcher.data?.ok === false ? <p className="px-4 py-2 text-base text-destructive">{t(fetcher.data.errorKey)}</p> : null}
      </section>

      <nav className="sticky bottom-0 z-10 mt-auto flex h-14 border-t border-border bg-background">
        <span className="-mt-px flex flex-1 items-center justify-center border-t-2 border-primary text-center text-base font-medium text-foreground">
          {t(keys.match.sparring.tabControl)}
        </span>
        <Link
          to={`/sparring/matches/${snapshot.matchId}/protocol/`}
          className="-mt-px flex flex-1 items-center justify-center border-t-2 border-transparent text-center text-base font-medium text-muted-foreground hover:text-foreground"
        >
          {t(keys.match.sparring.tabProtocol)}
        </Link>
      </nav>
    </main>
  )
}

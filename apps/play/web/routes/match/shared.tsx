import type { ProtocolRow, ReadMatchControlResult, ReadMatchProtocolResult } from '@ks/application'
import {
  type BySeatNumber,
  type Control,
  MatchCommand,
  MatchId,
  type MatchState,
  MatchStreamReady,
  MatchStreamUpdate,
} from '@ks/core'
import { type RegisteredGameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRevalidator } from 'react-router'
import * as v from 'valibot'

import { Button } from '@/components/ui'
import { matchCommandFromControl } from '@/features/match-control/renderers/types'

import type { AppLoadContext } from '../../server/context'
import { requireApplication } from '../../server/context'
import { localeFromCookie } from '../../server/locale'

type RouteArgs = {
  params: { matchId?: string }
  request: Request
  context: AppLoadContext
}

type ControlSuccess<K extends RegisteredGameKey> = Extract<ReadMatchControlResult<K>, { ok: true }>
type ProtocolSuccess<K extends RegisteredGameKey> = Extract<ReadMatchProtocolResult<K>, { ok: true }>

export type ControlRouteData<K extends RegisteredGameKey> = ControlSuccess<K> & { gameTitle: string }
export type ProtocolRouteData<K extends RegisteredGameKey> = ProtocolSuccess<K> & { gameTitle: string }

export function protocolFrameScore<K extends RegisteredGameKey>(
  state: ProtocolRouteData<K>['state'],
): BySeatNumber {
  const snapshotFrame = state.frames[state.currentFrameIndex - 1]
  return snapshotFrame?.pointsBySeat ?? { A: 0, B: 0 }
}

export type ControlActionData =
  | { ok: true; acceptedSeqMax: number | null }
  | {
      ok: false
      errorKey:
        | typeof keys.match.control.invalidCommandPayload
        | typeof keys.match.control.commandRejectedByRules
        | typeof keys.match.control.unknownMatch
        | typeof keys.match.control.matchLocked
    }

type ControlActionErrorKey = Extract<ControlActionData, { ok: false }>['errorKey']

const SubmittedMatchCommand = v.pipe(v.string(), v.parseJson(), MatchCommand)
const StreamReadyEventSchema = v.pipe(v.string(), v.parseJson(), MatchStreamReady)
const StreamUpdateEventSchema = v.pipe(v.string(), v.parseJson(), MatchStreamUpdate)

function matchIdFromParams(params: RouteArgs['params']): MatchId {
  const matchId = v.safeParse(MatchId, params.matchId)
  if (!matchId.success) throw new Response('Invalid matchId', { status: 400 })
  return matchId.output
}

export async function loadMatchControl<K extends RegisteredGameKey>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<ControlRouteData<K>> {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromCookie(args.request.headers.get('cookie'))
  const result = await requireApplication(args.context).readMatchControl(matchId, locale, expectedGameKey)
  if (!result.ok) throw new Response(result.error, { status: result.status })
  return { ...result, gameTitle: registry[expectedGameKey].meta.title[locale] }
}

export async function loadMatchProtocol<K extends RegisteredGameKey>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<ProtocolRouteData<K>> {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromCookie(args.request.headers.get('cookie'))
  const result = await requireApplication(args.context).readMatchProtocol(
    matchId,
    'UTC',
    locale,
    expectedGameKey,
  )
  if (!result.ok) throw new Response(result.error, { status: result.status })
  return { ...result, gameTitle: registry[expectedGameKey].meta.title[locale] }
}

function commandErrorKey(error: string): ControlActionErrorKey {
  if (error === 'unknown-match' || error === 'Unknown match') return keys.match.control.unknownMatch
  if (error === 'match-locked') return keys.match.control.matchLocked
  if (error === 'invalid-command-body' || error === 'command-id-conflict')
    return keys.match.control.invalidCommandPayload
  return keys.match.control.invalidCommandPayload
}

export async function commandMatchAction<K extends RegisteredGameKey>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<ControlActionData> {
  const matchId = matchIdFromParams(args.params)
  const form = await args.request.formData()
  const command = v.safeParse(SubmittedMatchCommand, form.get('command'))
  if (!command.success) {
    return { ok: false, errorKey: keys.match.control.invalidCommandPayload }
  }

  const result = await requireApplication(args.context).submitMatchCommand(
    matchId,
    command.output,
    expectedGameKey,
  )
  if (!result.ok) {
    if (result.status === 404) throw new Response(result.error, { status: 404 })
    if (result.status === 409) return { ok: false, errorKey: keys.match.control.matchLocked }
    if (result.status >= 500) throw new Response(result.error, { status: result.status })
    return { ok: false, errorKey: commandErrorKey(result.error) }
  }
  if (result.outcome._tag === 'rejected')
    return { ok: false, errorKey: keys.match.control.commandRejectedByRules }

  return {
    ok: true,
    acceptedSeqMax: result.outcome.acceptedSeq,
  }
}

export function matchCommandForm(command: MatchCommand) {
  return {
    command: JSON.stringify(command),
  }
}

export type ControlLiveState = {
  latestSeq: number
  suppressUntilSeq: number
  localSubmitInFlight: boolean
}

export type ControlLiveEvent =
  | { type: 'snapshot'; latestSeq: number }
  | { type: 'submit-started' }
  | { type: 'submit-finished' }
  | { type: 'accepted'; seq: number }
  | { type: 'ready'; seq: number }
  | { type: 'update'; seq: number }
  | { type: 'match-ended'; seq: number }
  | { type: 'error' }

export type ControlLiveTransition = {
  state: ControlLiveState
  revalidate: boolean
  close: boolean
}

export function transitionControlLive(
  state: ControlLiveState,
  event: ControlLiveEvent,
): ControlLiveTransition {
  if (event.type === 'snapshot') {
    return { state: { ...state, latestSeq: event.latestSeq }, revalidate: false, close: false }
  }
  if (event.type === 'submit-started') {
    return { state: { ...state, localSubmitInFlight: true }, revalidate: false, close: false }
  }
  if (event.type === 'submit-finished') {
    return { state: { ...state, localSubmitInFlight: false }, revalidate: false, close: false }
  }
  if (event.type === 'accepted') {
    return {
      state: { ...state, suppressUntilSeq: Math.max(state.suppressUntilSeq, event.seq) },
      revalidate: false,
      close: false,
    }
  }
  if (event.type === 'match-ended') {
    return {
      state: { ...state, latestSeq: Math.max(state.latestSeq, event.seq) },
      revalidate: true,
      close: true,
    }
  }
  if (event.type === 'error') return { state, revalidate: true, close: false }
  if (event.type === 'ready') return { state, revalidate: false, close: false }
  if (event.seq <= state.latestSeq) return { state, revalidate: false, close: false }
  return {
    state: { ...state, latestSeq: event.seq },
    revalidate: !state.localSubmitInFlight && event.seq > state.suppressUntilSeq,
    close: false,
  }
}

export type ControlLiveSource = {
  addEventListener(type: 'ready' | 'ev' | 'error', listener: (event: Event) => void): void
  removeEventListener(type: 'ready' | 'ev' | 'error', listener: (event: Event) => void): void
  close(): void
}

export function subscribeControlLive(args: {
  matchId: MatchId
  since: number
  createSource: (url: string) => ControlLiveSource
  applyEvent: (event: ControlLiveEvent, source: ControlLiveSource) => void
}): () => void {
  const source = args.createSource(`/api/m/${args.matchId}/stream/?since=${args.since}`)
  const onReady = (event: Event) => {
    if (!(event instanceof MessageEvent)) return
    const parsed = v.safeParse(StreamReadyEventSchema, event.data)
    if (parsed.success) args.applyEvent({ type: 'ready', seq: parsed.output.latestSeq }, source)
  }
  const onEvent = (event: Event) => {
    if (!(event instanceof MessageEvent)) return
    const parsed = v.safeParse(StreamUpdateEventSchema, event.data)
    if (!parsed.success) return
    args.applyEvent(
      parsed.output.terminal
        ? { type: 'match-ended', seq: parsed.output.acceptedSeq }
        : { type: 'update', seq: parsed.output.acceptedSeq },
      source,
    )
  }
  const onError = () => args.applyEvent({ type: 'error' }, source)
  source.addEventListener('ready', onReady)
  source.addEventListener('ev', onEvent)
  source.addEventListener('error', onError)
  return () => {
    source.removeEventListener('ready', onReady)
    source.removeEventListener('ev', onEvent)
    source.removeEventListener('error', onError)
    source.close()
  }
}

export function useControlLiveRevalidation(
  state: MatchState,
  latestSeq: number,
  fetcher: { state: string; data?: ControlActionData },
): () => void {
  const revalidator = useRevalidator()
  const liveStateRef = useRef<ControlLiveState>({
    latestSeq,
    suppressUntilSeq: latestSeq,
    localSubmitInFlight: false,
  })
  const revalidateRef = useRef(revalidator.revalidate)

  function applyLiveEvent(event: ControlLiveEvent, stream?: ControlLiveSource) {
    const transition = transitionControlLive(liveStateRef.current, event)
    liveStateRef.current = transition.state
    if (transition.close) stream?.close()
    if (transition.revalidate) revalidateRef.current()
  }

  useEffect(() => {
    revalidateRef.current = revalidator.revalidate
  }, [revalidator.revalidate])
  useEffect(() => {
    applyLiveEvent({ type: 'snapshot', latestSeq })
  }, [latestSeq])
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.acceptedSeqMax != null) {
      applyLiveEvent({ type: 'accepted', seq: fetcher.data.acceptedSeqMax })
    }
  }, [fetcher.data])
  useEffect(() => {
    applyLiveEvent({ type: fetcher.state === 'idle' ? 'submit-finished' : 'submit-started' })
  }, [fetcher.state])

  useEffect(() => {
    if (state.status !== 'active') return
    return subscribeControlLive({
      matchId: state.matchId,
      since: liveStateRef.current.latestSeq,
      createSource: (url) => new EventSource(url),
      applyEvent: applyLiveEvent,
    })
  }, [state.matchId, state.status])

  return () => {
    applyLiveEvent({ type: 'submit-started' })
  }
}

export function useProtocolLiveRevalidation(state: MatchState, latestSeq: number): void {
  const revalidator = useRevalidator()
  const latestSeqRef = useRef(latestSeq)
  const revalidateRef = useRef(revalidator.revalidate)

  useEffect(() => {
    revalidateRef.current = revalidator.revalidate
  }, [revalidator.revalidate])
  useEffect(() => {
    latestSeqRef.current = latestSeq
  }, [latestSeq])
  useEffect(() => {
    if (state.status !== 'active') return
    const stream = new EventSource(`/api/m/${state.matchId}/stream/?since=${latestSeqRef.current}`)
    const onReady = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const parsed = v.safeParse(StreamReadyEventSchema, event.data)
      // ready confirms the highest update already delivered; it never advances the cursor.
      if (parsed.success && parsed.output.latestSeq !== latestSeqRef.current) revalidateRef.current()
    }
    const onEvent = (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const parsed = v.safeParse(StreamUpdateEventSchema, event.data)
      if (!parsed.success || parsed.output.acceptedSeq <= latestSeqRef.current) return
      latestSeqRef.current = parsed.output.acceptedSeq
      if (parsed.output.terminal) stream.close()
      revalidateRef.current()
    }
    const onError = () => revalidateRef.current()
    stream.addEventListener('ready', onReady)
    stream.addEventListener('ev', onEvent)
    stream.addEventListener('error', onError)
    return () => {
      stream.removeEventListener('ready', onReady)
      stream.removeEventListener('ev', onEvent)
      stream.removeEventListener('error', onError)
      stream.close()
    }
  }, [state.matchId, state.status])
}

function matchControlLabel(t: TFunction, control: Control): string {
  switch (control.type) {
    case 'frame.commence':
      return t('match.control.commands.match.frame.commence')
    case 'frame.prepare':
      return t('match.control.commands.match.frame.prepare')
    case 'frame.concede':
      return t('match.control.commands.match.frame.concede')
    case 'match.end':
      return t('match.control.commands.match.match.end')
    default:
      return t('match.control.commands.unknown')
  }
}

export function BetweenFrameControls(props: {
  sections: ControlSuccess<RegisteredGameKey>['controlSections']
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  const { t } = useTranslation()
  const controls = [
    ...props.sections.neutral,
    ...props.sections.primary.A,
    ...props.sections.primary.B,
    ...props.sections.secondary.A,
    ...props.sections.secondary.B,
    ...props.sections.tertiary.A,
    ...props.sections.tertiary.B,
  ].filter((control) => control.source === 'match')
  return (
    <section aria-label={t(keys.match.control.perGameContainer)} className="border-b border-divider px-4 py-3">
      <div className="mx-auto grid w-2/3 gap-3.5">
        {controls.map((control, index) => (
          <Button
            key={`${control.type}-${index}`}
            type="button"
            size="control"
            variant={
              control.prominence === 'primary'
                ? 'default'
                : control.prominence === 'secondary'
                  ? 'secondary'
                  : 'outline'
            }
            disabled={props.submitting}
            onClick={() => props.onSubmit(matchCommandFromControl(control))}
          >
            {matchControlLabel(t, control)}
          </Button>
        ))}
      </div>
    </section>
  )
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

export function ProtocolPanel(props: { rows: ProtocolRow[]; emptyLabel: string }) {
  const { t } = useTranslation()
  if (props.rows.length === 0) return <p className="text-sm text-muted-foreground">{props.emptyLabel}</p>
  return (
    <div className="grid gap-2">
      {props.rows.map((row) => (
        <div
          key={row.key}
          className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 text-sm"
        >
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-baseline gap-2">
              {row.message.actor ? <span className="shrink-0 font-medium">{row.message.actor}</span> : null}
              <span>{protocolLabel(t, row)}</span>
            </span>
            {row.score ? (
              <span className="text-xs text-muted-foreground">{`${row.score.A}:${row.score.B}`}</span>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            <time dateTime={new Date(row.acceptedAt).toISOString()}>{row.timeLabel}</time>
          </span>
        </div>
      ))}
    </div>
  )
}

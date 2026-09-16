import type { ReadMatchControlResult, ReadMatchProtocolResult } from '@ks/application'
import { MatchCommand, MatchId, type MatchState } from '@ks/core'
import { type RegisteredGameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useEffect, useRef } from 'react'
import { useRevalidator } from 'react-router'
import * as v from 'valibot'

import { subscribeSparringMatchLive } from '@/live/sparring-match-live-client'

import { localeFromContext } from '../../locale'
import type { AppLoadContext } from '../../server/context'
import { requireApplication } from '../../server/context'

type RouteArgs = {
  params: { matchId?: string }
  request: Request
  context: AppLoadContext
}

type ControlSuccess<K extends RegisteredGameKey> = Extract<ReadMatchControlResult<K>, { ok: true }>

type ProtocolSuccess<K extends RegisteredGameKey> = Extract<ReadMatchProtocolResult<K>, { ok: true }>

export type ControlRouteData<K extends RegisteredGameKey> = ControlSuccess<K> & { gameTitle: string }

export type ProtocolRouteData<K extends RegisteredGameKey> = ProtocolSuccess<K> & { gameTitle: string }

export type ProtocolPageData<K extends RegisteredGameKey> = {
  control: ControlRouteData<K>
  protocol: ProtocolRouteData<K>
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
  const locale = localeFromContext(args.context)
  const result = await requireApplication(args.context).readMatchControl(matchId, locale, expectedGameKey)

  if (!result.ok) throw new Response(result.error, { status: result.status })

  return { ...result, gameTitle: registry[expectedGameKey].meta.title[locale] }
}

async function loadMatchProtocol<K extends RegisteredGameKey>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<ProtocolRouteData<K>> {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromContext(args.context)

  const result = await requireApplication(args.context).readMatchProtocol(
    matchId,
    'UTC',
    locale,
    expectedGameKey,
  )

  if (!result.ok) throw new Response(result.error, { status: result.status })

  return { ...result, gameTitle: registry[expectedGameKey].meta.title[locale] }
}

export async function loadMatchProtocolPage<K extends RegisteredGameKey>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<ProtocolPageData<K>> {
  const [control, protocol] = await Promise.all([
    loadMatchControl(args, expectedGameKey),
    loadMatchProtocol(args, expectedGameKey),
  ])

  return { control, protocol }
}

function commandErrorKey(error: string): ControlActionErrorKey {
  if (error === 'unknown-match' || error === 'Unknown match') return keys.match.control.unknownMatch

  if (error === 'match-locked') return keys.match.control.matchLocked

  if (error === 'invalid-command-body' || error === 'command-id-conflict')
    return keys.match.control.invalidCommandPayload

  return keys.match.control.invalidCommandPayload
}

export async function commandMatchAction(
  args: RouteArgs,
  expectedGameKey: RegisteredGameKey,
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
  | { type: 'update'; seq: number }
  | { type: 'match-ended'; seq: number }

export type ControlLiveTransition = {
  state: ControlLiveState
  revalidate: boolean
}

export function transitionControlLive(
  state: ControlLiveState,
  event: ControlLiveEvent,
): ControlLiveTransition {
  if (event.type === 'snapshot') {
    return { state: { ...state, latestSeq: event.latestSeq }, revalidate: false }
  }

  if (event.type === 'submit-started') {
    return { state: { ...state, localSubmitInFlight: true }, revalidate: false }
  }

  if (event.type === 'submit-finished') {
    return { state: { ...state, localSubmitInFlight: false }, revalidate: false }
  }

  if (event.type === 'accepted') {
    return {
      state: { ...state, suppressUntilSeq: Math.max(state.suppressUntilSeq, event.seq) },
      revalidate: false,
    }
  }

  if (event.type === 'match-ended') {
    return {
      state: { ...state, latestSeq: Math.max(state.latestSeq, event.seq) },
      revalidate: true,
    }
  }

  if (event.seq <= state.latestSeq) return { state, revalidate: false }

  return {
    state: { ...state, latestSeq: event.seq },
    revalidate: !state.localSubmitInFlight && event.seq > state.suppressUntilSeq,
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
  const revalidatorStateRef = useRef(revalidator.state)
  const loaderLatestSeqRef = useRef(latestSeq)
  const targetSeqRef = useRef(latestSeq)

  function drainRevalidation() {
    if (
      !liveStateRef.current.localSubmitInFlight &&
      revalidatorStateRef.current === 'idle' &&
      loaderLatestSeqRef.current < targetSeqRef.current
    ) {
      revalidatorStateRef.current = 'loading'
      void revalidateRef.current()
    }
  }

  function requestRevalidation(seq: number) {
    targetSeqRef.current = Math.max(targetSeqRef.current, seq)
    drainRevalidation()
  }

  function applyLiveEvent(event: ControlLiveEvent) {
    if (event.type === 'update' || event.type === 'match-ended') {
      targetSeqRef.current = Math.max(targetSeqRef.current, event.seq)
    }

    const transition = transitionControlLive(liveStateRef.current, event)
    liveStateRef.current = transition.state

    if (transition.revalidate || event.type === 'submit-finished') drainRevalidation()
  }

  useEffect(() => {
    revalidateRef.current = revalidator.revalidate
  }, [revalidator.revalidate])
  useEffect(() => {
    revalidatorStateRef.current = revalidator.state
  }, [revalidator.state])
  useEffect(() => {
    loaderLatestSeqRef.current = latestSeq
    applyLiveEvent({ type: 'snapshot', latestSeq })
    requestRevalidation(targetSeqRef.current)
  }, [latestSeq, revalidator.state])
  useEffect(() => {
    if (fetcher.data?.ok === true && fetcher.data.acceptedSeqMax != null) {
      applyLiveEvent({ type: 'accepted', seq: fetcher.data.acceptedSeqMax })
    }
  }, [fetcher.data])
  useEffect(() => {
    applyLiveEvent({ type: fetcher.state === 'idle' ? 'submit-finished' : 'submit-started' })
  }, [fetcher.state])

  useEffect(() => {
    if (state.status !== 'active') return undefined

    const subscription = subscribeSparringMatchLive({
      matchId: state.matchId,
      pageKind: 'control',
      currentLatestSeq: () => loaderLatestSeqRef.current,
      onCaughtUp: requestRevalidation,
      onUpdate: (update) =>
        applyLiveEvent(
          update.completesMatch
            ? { type: 'match-ended', seq: update.acceptedSeq }
            : { type: 'update', seq: update.acceptedSeq },
        ),
      onConnectionState: (connectionState) => {
        if (
          (connectionState === 'disconnected' || connectionState === 'completed') &&
          revalidatorStateRef.current === 'idle'
        ) {
          revalidatorStateRef.current = 'loading'
          void revalidateRef.current()
        }
      },
    })

    return () => subscription.stop()
  }, [state.matchId, state.status])

  return () => {
    applyLiveEvent({ type: 'submit-started' })
  }
}

export function useProtocolLiveRevalidation(state: MatchState, latestSeq: number): void {
  const revalidator = useRevalidator()
  const latestSeqRef = useRef(latestSeq)
  const revalidateRef = useRef(revalidator.revalidate)
  const revalidatorStateRef = useRef(revalidator.state)
  const targetSeqRef = useRef(latestSeq)

  function requestRevalidation(seq: number) {
    targetSeqRef.current = Math.max(targetSeqRef.current, seq)

    if (revalidatorStateRef.current === 'idle' && latestSeqRef.current < targetSeqRef.current) {
      revalidatorStateRef.current = 'loading'
      void revalidateRef.current()
    }
  }

  useEffect(() => {
    revalidateRef.current = revalidator.revalidate
  }, [revalidator.revalidate])
  useEffect(() => {
    revalidatorStateRef.current = revalidator.state
  }, [revalidator.state])
  useEffect(() => {
    latestSeqRef.current = latestSeq
    requestRevalidation(targetSeqRef.current)
  }, [latestSeq, revalidator.state])
  useEffect(() => {
    if (state.status !== 'active') return undefined

    const subscription = subscribeSparringMatchLive({
      matchId: state.matchId,
      pageKind: 'protocol',
      currentLatestSeq: () => latestSeqRef.current,
      onCaughtUp: requestRevalidation,
      onUpdate: (update) => requestRevalidation(update.acceptedSeq),
      onConnectionState: (connectionState) => {
        if (
          (connectionState === 'disconnected' || connectionState === 'completed') &&
          revalidatorStateRef.current === 'idle'
        ) {
          revalidatorStateRef.current = 'loading'
          void revalidateRef.current()
        }
      },
    })

    return () => subscription.stop()
  }, [state.matchId, state.status])
}

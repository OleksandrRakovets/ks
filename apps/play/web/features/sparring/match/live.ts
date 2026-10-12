import type { MatchReadFacts } from '@ks/application'
import type { MatchCommand } from '@ks/core'
import { keys } from '@ks/i18n'
import { useEffect, useRef } from 'react'
import { useRevalidator } from 'react-router'

import { subscribeSparringMatchLive } from './live-client'
import type { ControlActionData } from './types'

export function matchCommandForm(command: MatchCommand) {
  return { command: JSON.stringify(command) }
}

/** @internal Exported for live-revalidation contract tests. */
export type ControlLiveState = {
  latestSeq: number
  suppressUntilSeq: number
  localSubmitInFlight: boolean
}

type ControlLiveEvent =
  | { type: 'snapshot'; latestSeq: number }
  | { type: 'submit-started' }
  | { type: 'submit-finished' }
  | { type: 'accepted'; seq: number }
  | { type: 'update'; seq: number }
  | { type: 'match-finished'; seq: number }

type ControlLiveTransition = {
  state: ControlLiveState
  revalidate: boolean
}

/** @internal Exported for live-revalidation contract tests. */
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

  if (event.type === 'match-finished') {
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
  { matchId, lifecycle, latestSeq }: Pick<MatchReadFacts, 'matchId' | 'lifecycle' | 'latestSeq'>,
  fetcher: { state: string; data?: ControlActionData },
  discarding: boolean,
): () => void {
  const revalidator = useRevalidator()
  const discardingRef = useRef(discarding)

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
    if (event.type === 'update' || event.type === 'match-finished') {
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
    discardingRef.current = discarding
  }, [discarding])
  useEffect(() => {
    loaderLatestSeqRef.current = latestSeq
    applyLiveEvent({ type: 'snapshot', latestSeq })
    requestRevalidation(targetSeqRef.current)
  }, [latestSeq, revalidator.state])
  useEffect(() => {
    if (fetcher.data?.ok === true && fetcher.data.acceptedSeqMax != null) {
      applyLiveEvent({ type: 'accepted', seq: fetcher.data.acceptedSeqMax })
    } else if (
      fetcher.data?.ok === false &&
      fetcher.data.errorKey === keys.match.control.correctionUnavailable
    ) {
      void revalidateRef.current()
    }
  }, [fetcher.data])
  useEffect(() => {
    applyLiveEvent({ type: fetcher.state === 'idle' ? 'submit-finished' : 'submit-started' })
  }, [fetcher.state])

  useEffect(() => {
    if (lifecycle !== 'active') return undefined

    function catchUp() {
      if (document.visibilityState !== 'visible' || revalidatorStateRef.current !== 'idle') return

      revalidatorStateRef.current = 'loading'
      void revalidateRef.current()
    }

    const subscription = subscribeSparringMatchLive({
      matchId,
      pageKind: 'control',
      currentLatestSeq: () => loaderLatestSeqRef.current,
      onCaughtUp: requestRevalidation,
      onUpdate: (update) =>
        applyLiveEvent(
          update.endsMatch
            ? { type: 'match-finished', seq: update.acceptedSeq }
            : { type: 'update', seq: update.acceptedSeq },
        ),
      onConnectionState: (connectionState) => {
        // The room closes this page's socket before the discard redirect arrives; revalidating would show a 404.
        if (discardingRef.current) return

        if (
          (connectionState === 'disconnected' || connectionState === 'finished') &&
          revalidatorStateRef.current === 'idle'
        ) {
          revalidatorStateRef.current = 'loading'
          void revalidateRef.current()
        }
      },
    })

    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('focus', catchUp)
    window.addEventListener('online', catchUp)

    return () => {
      document.removeEventListener('visibilitychange', catchUp)
      window.removeEventListener('focus', catchUp)
      window.removeEventListener('online', catchUp)
      subscription.stop()
    }
  }, [matchId, lifecycle])

  return () => {
    applyLiveEvent({ type: 'submit-started' })
  }
}

export function useProtocolLiveRevalidation({
  matchId,
  lifecycle,
  latestSeq,
}: Pick<MatchReadFacts, 'matchId' | 'lifecycle' | 'latestSeq'>): void {
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
    if (lifecycle !== 'active') return undefined

    function catchUp() {
      if (document.visibilityState !== 'visible' || revalidatorStateRef.current !== 'idle') return

      revalidatorStateRef.current = 'loading'
      void revalidateRef.current()
    }

    const subscription = subscribeSparringMatchLive({
      matchId,
      pageKind: 'protocol',
      currentLatestSeq: () => latestSeqRef.current,
      onCaughtUp: requestRevalidation,
      onUpdate: (update) => requestRevalidation(update.acceptedSeq),
      onConnectionState: (connectionState) => {
        if (
          (connectionState === 'disconnected' || connectionState === 'finished') &&
          revalidatorStateRef.current === 'idle'
        ) {
          revalidatorStateRef.current = 'loading'
          void revalidateRef.current()
        }
      },
    })

    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('focus', catchUp)
    window.addEventListener('online', catchUp)

    return () => {
      document.removeEventListener('visibilitychange', catchUp)
      window.removeEventListener('focus', catchUp)
      window.removeEventListener('online', catchUp)
      subscription.stop()
    }
  }, [matchId, lifecycle])
}

import {
  type MatchId,
  type MatchStreamUpdate,
  SPARRING_MATCH_LIVE_ENDED_CLOSE_CODE,
  SparringMatchLiveServerMessage,
} from '@ks/core'
import * as v from 'valibot'

export type SparringMatchLiveConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'finished'
  | 'invalid-message'

/** A running match-live transport subscription. */
export type SparringMatchLiveSubscription = {
  /**
   * Permanently disposes this subscription, cancelling handshake/reconnect work and closing its
   * current socket. Disposal is idempotent. Events delivered later by the browser are ignored.
   *
   * Intentional disposal does not emit `disconnected`: the owner already knows it ended the
   * lifecycle (for example, because its page became hidden).
   */
  stop(): void
}

/**
 * Subscribes to invalidation hints for one active sparring match.
 *
 * A socket is ready only after its first valid `caught-up` message, not merely after the browser's
 * `open` event. `connected` therefore means the server cursor is established. Updates are checked
 * against that cursor; gaps request an authoritative HTTP read through `onCaughtUp` and reconnect.
 * A `live-ended` message or the terminal close, whichever arrives first, permanently finishes the
 * subscription. The message carries no cursor, so it never depends on update de-duplication.
 *
 * Connection and handshake failures emit `disconnected` and retry with bounded exponential
 * backoff. Browser JavaScript cannot reliably distinguish an HTTP 410 WebSocket handshake failure,
 * so a disconnect deliberately forces the owning page to perform its authoritative HTTP read.
 * This transport does not own browser visibility lifecycle; callers should stop it and create a
 * fresh subscription when appropriate.
 */
export function subscribeSparringMatchLive(args: {
  matchId: MatchId
  pageKind: 'control' | 'protocol'
  currentLatestSeq: () => number
  onUpdate(update: MatchStreamUpdate): void
  onCaughtUp(latestSeq: number): void
  onConnectionState(state: SparringMatchLiveConnectionState): void
}): SparringMatchLiveSubscription {
  let stopped = false
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let handshakeTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0
  let serverSeq: number | null = null

  const stop = () => {
    if (stopped) return
    stopped = true

    if (reconnectTimer) clearTimeout(reconnectTimer)

    if (handshakeTimer) clearTimeout(handshakeTimer)
    reconnectTimer = null
    handshakeTimer = null
    socket?.close()
    socket = null
  }

  const rejectInvalidMessage = () => {
    args.onConnectionState('invalid-message')
    stop()
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return
    args.onConnectionState('disconnected')
    const base = Math.min(30_000, 500 * 2 ** reconnectAttempt++)
    const delay = Math.round(base * (0.75 + Math.random() * 0.5))
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  const connect = () => {
    if (stopped) return
    args.onConnectionState('connecting')
    serverSeq = null
    const webSocketScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    const url = new URL(
      `/api/sparring-match/${args.matchId}/live/?contract=1&view=${args.pageKind}`,
      `${webSocketScheme}//${window.location.host}`,
    )

    const current = new WebSocket(url)
    socket = current

    const currentHandshakeTimer = setTimeout(() => {
      // Disposal and replacement guards are essential: browser events and timers may arrive late.
      if (stopped || socket !== current || handshakeTimer !== currentHandshakeTimer) return
      handshakeTimer = null
      socket = null
      current.close()
      scheduleReconnect()
    }, 10_000)

    handshakeTimer = currentHandshakeTimer
    current.addEventListener('message', (event) => {
      if (stopped || socket !== current) return

      const message = v.safeParse(
        v.pipe(v.string(), v.parseJson(), SparringMatchLiveServerMessage),
        event.data,
      )

      if (!message.success) {
        rejectInvalidMessage()

        return
      }

      if (message.output.type === 'live-ended') {
        args.onConnectionState('finished')
        stop()

        return
      }

      if (message.output.type === 'caught-up') {
        if (message.output.matchId !== args.matchId || serverSeq !== null) {
          rejectInvalidMessage()

          return
        }

        serverSeq = message.output.latestSeq

        if (handshakeTimer === currentHandshakeTimer) {
          clearTimeout(currentHandshakeTimer)
          handshakeTimer = null
        }

        reconnectAttempt = 0
        args.onConnectionState('connected')

        if (serverSeq > args.currentLatestSeq()) args.onCaughtUp(serverSeq)

        return
      }

      if (serverSeq === null) {
        rejectInvalidMessage()

        return
      }

      const update = message.output.update

      if (update.acceptedSeq <= serverSeq) return

      if (update.acceptedSeq !== serverSeq + 1) {
        args.onCaughtUp(update.acceptedSeq)
        current.close()

        return
      }

      serverSeq = update.acceptedSeq
      args.onUpdate(update)
    })
    current.addEventListener('close', (event) => {
      // A replaced socket must not clear the replacement's timers or schedule another retry.
      if (stopped || socket !== current) return
      socket = null

      if (handshakeTimer === currentHandshakeTimer) {
        clearTimeout(currentHandshakeTimer)
        handshakeTimer = null
      }

      if (event.code === SPARRING_MATCH_LIVE_ENDED_CLOSE_CODE) {
        args.onConnectionState('finished')
        stop()

        return
      }

      scheduleReconnect()
    })
    current.addEventListener('error', () => {
      if (!stopped && socket === current) current.close()
    })
  }

  connect()

  return { stop }
}

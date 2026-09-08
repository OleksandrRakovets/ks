import {
  type MatchId,
  type MatchStreamUpdate,
  SPARRING_MATCH_LIVE_COMPLETED_CLOSE_CODE,
  SparringMatchLiveServerMessage,
} from '@ks/core'
import * as v from 'valibot'

export type SparringMatchLiveConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'completed'
  | 'protocol-error'
export type SparringMatchLiveSubscription = { stop(): void }

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
  let reconnectAttempt = 0
  let serverSeq: number | null = null

  const stop = () => {
    if (stopped) return
    stopped = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    socket?.close()
    socket = null
  }

  const failProtocol = () => {
    args.onConnectionState('protocol-error')
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
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = new URL(
      `/api/sparring-match/${args.matchId}/live/?contract=1&view=${args.pageKind}`,
      `${protocol}//${window.location.host}`,
    )
    const current = new WebSocket(url)
    socket = current
    current.addEventListener('open', () => {
      if (stopped || socket !== current) return
      args.onConnectionState('connected')
    })
    current.addEventListener('message', (event) => {
      if (stopped || socket !== current) return
      const message = v.safeParse(
        v.pipe(v.string(), v.parseJson(), SparringMatchLiveServerMessage),
        event.data,
      )
      if (!message.success) return failProtocol()
      if (message.output.type === 'caught-up') {
        if (message.output.matchId !== args.matchId || serverSeq !== null) return failProtocol()
        serverSeq = message.output.latestSeq
        reconnectAttempt = 0
        if (serverSeq > args.currentLatestSeq()) args.onCaughtUp(serverSeq)
        return
      }
      if (serverSeq === null) return failProtocol()
      const update = message.output.update
      if (update.acceptedSeq <= serverSeq) return
      if (update.acceptedSeq !== serverSeq + 1) {
        args.onCaughtUp(update.acceptedSeq)
        current.close()
        return
      }
      serverSeq = update.acceptedSeq
      args.onUpdate(update)
      if (update.completesMatch) stop()
    })
    current.addEventListener('close', (event) => {
      if (socket === current) socket = null
      if (stopped) return
      if (event.code === SPARRING_MATCH_LIVE_COMPLETED_CLOSE_CODE) {
        args.onCaughtUp(serverSeq ?? args.currentLatestSeq())
        args.onConnectionState('completed')
        stop()
        return
      }
      scheduleReconnect()
    })
    current.addEventListener('error', () => {
      if (!stopped && socket === current) current.close()
    })
  }

  // Deferring avoids opening the throwaway connection from React Strict Mode's setup → cleanup probe.
  queueMicrotask(connect)
  return { stop }
}

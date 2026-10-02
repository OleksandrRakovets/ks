import {
  type MatchId,
  type MatchStreamUpdate,
  SPARRING_MATCH_LIVE_FINISHED_CLOSE_CODE,
  SparringMatchLiveServerMessage,
} from '@ks/core'
import { Result, Schema } from 'effect'

export type SparringMatchLiveConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'finished'
  | 'invalid-message'

export type SparringMatchLiveSubscription = { stop(): void }

export function subscribeSparringMatchLive(args: {
  matchId: typeof MatchId.Type
  pageKind: 'control' | 'protocol'
  currentLatestSeq: () => number
  onUpdate(update: typeof MatchStreamUpdate.Type): void
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
    current.addEventListener('open', () => {
      if (stopped || socket !== current) return
      args.onConnectionState('connected')
    })
    current.addEventListener('message', (event) => {
      if (stopped || socket !== current) return

      const message = Schema.decodeUnknownResult(Schema.fromJsonString(SparringMatchLiveServerMessage))(
        event.data,
      )

      if (Result.isFailure(message)) {
        rejectInvalidMessage()

        return
      }

      if (message.success.type === 'caught-up') {
        if (message.success.matchId !== args.matchId || serverSeq !== null) {
          rejectInvalidMessage()

          return
        }

        serverSeq = message.success.latestSeq
        reconnectAttempt = 0

        if (serverSeq > args.currentLatestSeq()) args.onCaughtUp(serverSeq)

        return
      }

      if (serverSeq === null) {
        rejectInvalidMessage()

        return
      }

      const update = message.success.update

      if (update.acceptedSeq <= serverSeq) return

      if (update.acceptedSeq !== serverSeq + 1) {
        args.onCaughtUp(update.acceptedSeq)

        if (update.endsMatch) {
          args.onConnectionState('finished')
          stop()

          return
        }

        current.close()

        return
      }

      serverSeq = update.acceptedSeq
      args.onUpdate(update)

      if (update.endsMatch) stop()
    })
    current.addEventListener('close', (event) => {
      if (socket === current) socket = null

      if (stopped) return

      if (event.code === SPARRING_MATCH_LIVE_FINISHED_CLOSE_CODE) {
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

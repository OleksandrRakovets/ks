import {
  MatchId,
  type MatchStreamUpdate,
  SPARRING_MATCH_LIVE_COMPLETED_CLOSE_CODE,
  SPARRING_MATCH_LIVE_COMPLETED_CLOSE_REASON,
  SparringMatchLiveContractVersion,
  SparringMatchLivePageKind,
  SparringMatchLiveQuery,
} from '@ks/core'
import * as v from 'valibot'

export type LiveConnectionCursor = {
  readonly matchId: MatchId
  readonly latestSeq: number
}
const ConnectionAttachment = v.strictObject({
  contractVersion: SparringMatchLiveContractVersion,
  connectionId: v.pipe(v.string(), v.uuid()),
  pageKind: SparringMatchLivePageKind,
})
type ConnectionAttachment = v.InferOutput<typeof ConnectionAttachment>

export class LiveConnectionHandler {
  readonly #ctx: DurableObjectState

  constructor(ctx: DurableObjectState) {
    this.#ctx = ctx
  }

  /** Accepts a socket and sends its catch-up cursor synchronously, leaving no command-delivery gap. */
  connect(cursor: LiveConnectionCursor, pageKind: SparringMatchLivePageKind): Response {
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    const attachment: ConnectionAttachment = {
      contractVersion: 1,
      connectionId: crypto.randomUUID(),
      pageKind,
    }
    server.serializeAttachment(attachment)
    this.#ctx.acceptWebSocket(server)
    server.send(
      JSON.stringify({
        contractVersion: 1,
        type: 'caught-up',
        matchId: cursor.matchId,
        latestSeq: cursor.latestSeq,
      }),
    )
    console.info({ event: 'sparring-match-live.accepted', matchId: cursor.matchId, ...attachment })
    return new Response(null, { status: 101, webSocket: client })
  }

  receiveMessage(socket: WebSocket): void {
    socket.close(1008, 'client-messages-not-supported')
  }

  recordClose(socket: WebSocket, code: number, reason: string, wasClean: boolean): void {
    console.info({
      event: 'sparring-match-live.closed',
      matchId: this.#ctx.id.name,
      ...deserializeConnectionAttachment(socket),
      code,
      reason,
      wasClean,
    })
  }

  recordError(socket: WebSocket, error: Error): void {
    console.error({
      event: 'sparring-match-live.error',
      matchId: this.#ctx.id.name,
      ...deserializeConnectionAttachment(socket),
      error: error.message,
    })
  }

  broadcast(update: MatchStreamUpdate): void {
    const message = JSON.stringify({ contractVersion: 1, type: 'update', update })
    for (const socket of this.#ctx.getWebSockets()) {
      try {
        socket.send(message)
      } catch {
        // The peer may have disconnected before the runtime delivered its close event.
      }
    }
  }

  closeAll(): void {
    for (const socket of this.#ctx.getWebSockets()) {
      try {
        socket.close(SPARRING_MATCH_LIVE_COMPLETED_CLOSE_CODE, SPARRING_MATCH_LIVE_COMPLETED_CLOSE_REASON)
      } catch {
        // The peer may already have disconnected.
      }
    }
  }

  validateHandshake(request: Request): SparringMatchLivePageKind | null {
    const url = new URL(request.url)
    const route = /^\/api\/sparring-match\/([^/]+)\/live\/$/.exec(url.pathname)
    const matchId = v.safeParse(MatchId, route?.[1])
    const query = v.safeParse(SparringMatchLiveQuery, Object.fromEntries(url.searchParams))
    if (
      !matchId.success ||
      matchId.output !== this.#ctx.id.name ||
      !query.success ||
      request.method !== 'GET' ||
      request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
      url.searchParams.size !== 2
    )
      return null
    return query.output.view
  }
}

function deserializeConnectionAttachment(socket: WebSocket): ConnectionAttachment {
  return v.parse(ConnectionAttachment, socket.deserializeAttachment())
}

import {
  type MatchId,
  type MatchStreamUpdate,
  SPARRING_MATCH_LIVE_COMPLETED_CLOSE_CODE,
  SPARRING_MATCH_LIVE_COMPLETED_CLOSE_REASON,
} from '@ks/core'
import * as v from 'valibot'

type PageKind = 'control' | 'protocol'
const ConnectionAttachment = v.object({
  contractVersion: v.literal(1),
  connectionId: v.pipe(v.string(), v.uuid()),
  pageKind: v.picklist(['control', 'protocol']),
})
type ConnectionAttachment = v.InferOutput<typeof ConnectionAttachment>

export class Broadcaster {
  readonly #ctx: DurableObjectState

  constructor(ctx: DurableObjectState) {
    this.#ctx = ctx
  }

  connect(matchId: MatchId, pageKind: PageKind, latestSeq: number): Response {
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
    server.send(JSON.stringify({ contractVersion: 1, type: 'caught-up', matchId, latestSeq }))
    console.info({ event: 'sparring-match-live.accepted', matchId, ...attachment })
    return new Response(null, { status: 101, webSocket: client })
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
}

export function connectionAttachment(socket: WebSocket): ConnectionAttachment {
  return v.parse(ConnectionAttachment, socket.deserializeAttachment())
}

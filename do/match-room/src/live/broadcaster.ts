import type { AcceptedCommandStreamUpdate } from '@ks/core'

const encoder = new TextEncoder()

type Client = { controller: ReadableStreamDefaultController<Uint8Array>; pingTimer: ReturnType<typeof setInterval> }

export class Broadcaster {
  private clients = new Set<Client>()

  stream(ready: number, backlog: AcceptedCommandStreamUpdate[]): Response {
    let client: Client | null = null
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        for (const update of backlog) controller.enqueue(encoder.encode(`event: ev\ndata: ${JSON.stringify(update)}\n\n`))
        controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ latestSeq: ready })}\n\n`))
        client = {
          controller,
          pingTimer: setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`))
            } catch {
              this.remove(client)
            }
          }, 25000),
        }
        this.clients.add(client)
      },
      cancel: () => this.remove(client),
    })
    return new Response(stream, {
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' },
    })
  }

  broadcast(update: AcceptedCommandStreamUpdate): void {
    const bytes = encoder.encode(`event: ev\ndata: ${JSON.stringify(update)}\n\n`)
    for (const client of this.clients) {
      try {
        client.controller.enqueue(bytes)
      } catch {
        this.remove(client)
      }
    }
  }

  closeAll(): void {
    for (const client of this.clients) {
      clearInterval(client.pingTimer)
      try {
        client.controller.close()
      } catch {
        // The peer may already have disconnected.
      }
    }
    this.clients.clear()
  }

  private remove(client: Client | null): void {
    if (!client) return
    clearInterval(client.pingTimer)
    this.clients.delete(client)
  }
}

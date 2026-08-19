import type { StoredFact } from '@ks/core'

const encoder = new TextEncoder()

type Client = { controller: ReadableStreamDefaultController<Uint8Array>; pingTimer: ReturnType<typeof setInterval> }

export class Broadcaster {
  private clients = new Set<Client>()

  stream(ready: number, backlog: StoredFact[]): Response {
    let client: Client | null = null
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ latestSeq: ready })}\n\n`))
        for (const fact of backlog) controller.enqueue(encoder.encode(`event: ev\ndata: ${JSON.stringify(fact)}\n\n`))
        client = {
          controller,
          pingTimer: setInterval(() => controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`)), 25000),
        }
        this.clients.add(client)
      },
      cancel: () => this.remove(client),
    })
    return new Response(stream, {
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' },
    })
  }

  broadcast(fact: StoredFact): void {
    const bytes = encoder.encode(`event: ev\ndata: ${JSON.stringify(fact)}\n\n`)
    for (const client of this.clients) {
      try {
        client.controller.enqueue(bytes)
      } catch {
        this.remove(client)
      }
    }
  }

  private remove(client: Client | null): void {
    if (!client) return
    clearInterval(client.pingTimer)
    this.clients.delete(client)
  }
}

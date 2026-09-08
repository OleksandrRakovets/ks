import { type MatchCommand, MatchId } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'
import * as v from 'valibot'

import type { Env } from './env'
import { Broadcaster, connectionAttachment } from './live/broadcaster'
import { ActiveMatchHandler } from './match/active-match-handler'
import { FinalizingMatchHandler } from './match/finalizing-match-handler'
import { initializeMatch, type InitializeMatchInput } from './match/initialize-match'
import { MatchStorage } from './storage/match-storage'

export class MatchRoom extends DurableObject<Env> {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  #handler: ActiveMatchHandler | FinalizingMatchHandler | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.#storage = new MatchStorage(ctx.storage)
    this.#broadcaster = new Broadcaster(ctx)
    ctx.blockConcurrencyWhile(async () => {
      this.#storage.migrate()
    })
  }

  async initialize(input: InitializeMatchInput) {
    if (this.ctx.id.name !== input.matchId)
      throw new Error('MatchRoom routed identity does not match initialization Match')
    return initializeMatch(this.#storage, input)
  }

  async submitCommand(command: MatchCommand) {
    const handler = this.#requireHandler()
    if (handler instanceof FinalizingMatchHandler) return handler.submitCommand(command)
    try {
      const outcome = handler.submitCommand(command)
      if (outcome.next)
        this.#handler = new FinalizingMatchHandler(
          this.#storage,
          this.#broadcaster,
          outcome.next.storedMatch,
          outcome.next.resident,
        )
      return outcome.response
    } catch (error) {
      this.#handler = null
      throw error
    }
  }

  async getControls() {
    return this.#requireHandler().getControls()
  }

  async getProtocol() {
    return this.#requireHandler().getProtocol()
  }

  /** Serves only the dedicated WebSocket handshake forwarded by Play; it is not a general HTTP API. */
  fetch(request: Request): Response {
    const url = new URL(request.url)
    const match = /^\/api\/sparring-match\/([^/]+)\/live\/$/.exec(url.pathname)
    const matchId = v.safeParse(MatchId, match?.[1])
    if (!matchId.success || matchId.output !== this.ctx.id.name)
      return new Response('Invalid MatchRoom route', { status: 400 })
    const pageKind = url.searchParams.get('view')
    if (
      request.method !== 'GET' ||
      request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
      url.searchParams.get('contract') !== '1' ||
      (pageKind !== 'control' && pageKind !== 'protocol') ||
      url.searchParams.size !== 2
    )
      return new Response('Invalid live request', { status: 400 })
    try {
      const handler = this.#requireHandler()
      return handler instanceof ActiveMatchHandler
        ? handler.connect(pageKind)
        : new Response('Match is finalizing', { status: 410 })
    } catch {
      return new Response('Internal server error', { status: 500 })
    }
  }

  webSocketMessage(socket: WebSocket): void {
    socket.close(1008, 'client-messages-not-supported')
  }

  webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean): void {
    const attachment = connectionAttachment(socket)
    console.info({
      event: 'sparring-match-live.closed',
      matchId: this.ctx.id.name,
      ...attachment,
      code,
      reason,
      wasClean,
    })
  }

  webSocketError(socket: WebSocket, error: Error): void {
    const attachment = connectionAttachment(socket)
    console.error({
      event: 'sparring-match-live.error',
      matchId: this.ctx.id.name,
      ...attachment,
      error: error.message,
    })
  }

  async prepareArchive() {
    const handler = this.#requireHandler()
    if (handler instanceof ActiveMatchHandler) throw new Error('Cannot prepare archive for active Match')
    return handler.prepareArchive()
  }

  async finalize(): Promise<void> {
    const handler = this.#requireHandler()
    if (handler instanceof ActiveMatchHandler) throw new Error('Cannot finalize active Match')
    handler.finalize()
  }

  #requireHandler(): ActiveMatchHandler | FinalizingMatchHandler {
    if (this.#handler) return this.#handler
    const storedMatch = this.#storage.match()
    if (!storedMatch) throw new Error('MatchRoom storage missing')
    this.#handler =
      storedMatch.status === 'active'
        ? new ActiveMatchHandler(this.#storage, this.#broadcaster, storedMatch)
        : new FinalizingMatchHandler(this.#storage, this.#broadcaster, storedMatch)
    return this.#handler
  }
}

import { type MatchCommand } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'

import type { Env } from './env'
import { LiveConnectionHandler } from './live/live-connection-handler'
import { ActiveMatchHandler } from './match/active-match-handler'
import { FinalizingMatchHandler } from './match/finalizing-match-handler'
import { initializeMatch, type InitializeMatchInput } from './match/initialize-match'
import { MatchStorage } from './storage/match-storage'

export class MatchRoom extends DurableObject<Env> {
  readonly #storage: MatchStorage
  readonly #liveConnections: LiveConnectionHandler
  #handler: ActiveMatchHandler | FinalizingMatchHandler | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.#storage = new MatchStorage(ctx.storage)
    this.#liveConnections = new LiveConnectionHandler(ctx)
    void ctx.blockConcurrencyWhile(async () => {
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
          this.#liveConnections,
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

  /**
   * Serves only the dedicated WebSocket handshake forwarded by Play; it is not a general HTTP API.
   * Validation, synchronous cursor capture, and socket acceptance remain in one event turn with no await.
   */
  fetch(request: Request): Response {
    const pageKind = this.#liveConnections.validateHandshake(request)
    if (!pageKind) return new Response('Invalid live request', { status: 400 })
    const handler = this.#requireHandler()
    return handler instanceof ActiveMatchHandler
      ? this.#liveConnections.connect(handler.liveConnectionCursor(), pageKind)
      : new Response('Match is finalizing', { status: 410 })
  }

  webSocketMessage(socket: WebSocket): void {
    this.#liveConnections.receiveMessage(socket)
  }

  webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean): void {
    this.#liveConnections.recordClose(socket, code, reason, wasClean)
  }

  webSocketError(socket: WebSocket, error: Error): void {
    this.#liveConnections.recordError(socket, error)
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
        ? new ActiveMatchHandler(this.#storage, this.#liveConnections, storedMatch)
        : new FinalizingMatchHandler(this.#storage, this.#liveConnections, storedMatch)
    return this.#handler
  }
}

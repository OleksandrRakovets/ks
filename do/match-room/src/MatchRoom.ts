/** Worker-only Durable Object implementation exported through Play's generated binding. */
import { type MatchCommand } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'

import type { Env } from './env'
import { LiveConnectionHandler } from './live/live-connection-handler'
import { ActiveMatchHandler } from './match/active-match-handler'
import { DiscardedMatchHandler } from './match/discarded-match-handler'
import { FinalizingMatchHandler } from './match/finalizing-match-handler'
import { initializeMatch, type InitializeMatchInput } from './match/initialize-match'
import { MatchStorage } from './storage/match-storage'

export class MatchRoom extends DurableObject<Env> {
  readonly #storage: MatchStorage
  readonly #liveConnections: LiveConnectionHandler

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

  async discard() {
    return this.#requireHandler().discard()
  }

  async submitCommand(command: MatchCommand) {
    return this.#requireHandler().submitCommand(command)
  }

  async getControls() {
    return this.#requireHandler().getControls()
  }

  async getProtocol() {
    return this.#requireHandler().getProtocol()
  }

  async getScore() {
    return this.#requireHandler().getScore()
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
      : handler instanceof DiscardedMatchHandler
        ? new Response('Unknown match', { status: 404 })
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

    if (!(handler instanceof FinalizingMatchHandler))
      throw new Error('Cannot prepare archive for active or discarded Match')

    return handler.prepareArchive()
  }

  #requireHandler(): ActiveMatchHandler | FinalizingMatchHandler | DiscardedMatchHandler {
    const record = this.#storage.anyMatchRecord

    switch (record.status) {
      case 'active':
        return new ActiveMatchHandler(this.#storage, this.#liveConnections)
      case 'finalizing':
        return new FinalizingMatchHandler(this.#storage)
      case 'discarded':
        return new DiscardedMatchHandler(record.endedAt)
      default:
        throw new Error('Unsupported MatchRoom lifecycle', { cause: record satisfies never })
    }
  }
}

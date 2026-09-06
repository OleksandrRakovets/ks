import type { MatchCommand } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'

import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import { ActiveMatchHandler } from './match/active-match-handler'
import { FinalizingMatchHandler } from './match/finalizing-match-handler'
import { initializeMatch, type InitializeMatchInput } from './match/initialize-match'
import { MatchStorage } from './storage/match-storage'

export class MatchRoom extends DurableObject<Env> {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  #handler: MatchHandler | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.#storage = new MatchStorage(ctx.storage)
    this.#broadcaster = new Broadcaster()
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
          outcome.next.stored,
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

  async stream(since?: number) {
    const handler = this.#requireHandler()
    return handler instanceof ActiveMatchHandler ? handler.stream(since) : handler.stream()
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

  #requireHandler(): MatchHandler {
    if (this.#handler) return this.#handler
    const stored = this.#storage.match()
    if (!stored) throw new Error('MatchRoom storage missing')
    this.#handler =
      stored.status === 'active'
        ? new ActiveMatchHandler(this.#storage, this.#broadcaster, stored)
        : new FinalizingMatchHandler(this.#storage, this.#broadcaster, stored)
    return this.#handler
  }
}

type MatchHandler = ActiveMatchHandler | FinalizingMatchHandler

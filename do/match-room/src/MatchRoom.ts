import type { MatchCommand } from '@ks/core'
import { nowUnixEpochMilliseconds } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'

import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import { ActiveMatchOperations } from './match/active-match-operations'
import { FinalizingMatchOperations } from './match/finalizing-match-operations'
import { initializeMatch, type InitializeMatchInput } from './match/initialize-match'
import { MatchStorage } from './storage/match-storage'

const FINALIZED_ROOM_RETENTION_MS = 10 * 60 * 1000

export class MatchRoom extends DurableObject<Env> {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  #operations: MatchOperations | null = null
  #disposed = false

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
    const result = initializeMatch(this.#storage, input)
    if (result._tag === 'initialized') this.#operations = null
    return result
  }

  async submitCommand(command: MatchCommand) {
    const operations = this.#requireOperations()
    if (operations instanceof FinalizingMatchOperations) return operations.submitCommand(command)
    try {
      const outcome = operations.submitCommand(command)
      if (outcome.next)
        this.#operations = new FinalizingMatchOperations(
          this.#storage,
          this.#broadcaster,
          outcome.next.stored,
          outcome.next.resident,
        )
      return outcome.response
    } catch (error) {
      this.#operations = null
      throw error
    }
  }

  async getControls() {
    return this.#requireOperations().getControls()
  }

  async getProtocol() {
    return this.#requireOperations().getProtocol()
  }

  async stream(since?: number) {
    const operations = this.#requireOperations()
    return operations instanceof ActiveMatchOperations ? operations.stream(since) : operations.stream()
  }

  async prepareArchive() {
    const operations = this.#requireOperations()
    if (operations instanceof ActiveMatchOperations) throw new Error('Cannot prepare archive for active Match')
    return operations.prepareArchive()
  }

  async finalize(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.#disposed) return
      const operations = this.#readOperations()
      if (!operations) return
      if (operations instanceof ActiveMatchOperations) throw new Error('Cannot finalize active Match')
      operations.finalize()
      if ((await this.ctx.storage.getAlarm()) === null)
        await this.ctx.storage.setAlarm(nowUnixEpochMilliseconds() + FINALIZED_ROOM_RETENTION_MS)
    })
  }

  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.#disposed) return
      const operations = this.#readOperations()
      if (!operations) return
      if (operations instanceof ActiveMatchOperations) throw new Error('Cannot dispose active Match')
      operations.dispose()
      await this.ctx.storage.deleteAll()
      this.#operations = null
      this.#disposed = true
    })
  }

  #requireOperations(): MatchOperations {
    const operations = this.#readOperations()
    if (!operations) throw new Error('MatchRoom storage missing')
    return operations
  }

  #readOperations(): MatchOperations | null {
    if (this.#operations) return this.#operations
    const stored = this.#storage.match()
    if (!stored) return null
    this.#operations =
      stored.status === 'active'
        ? new ActiveMatchOperations(this.#storage, this.#broadcaster, stored)
        : new FinalizingMatchOperations(this.#storage, this.#broadcaster, stored)
    return this.#operations
  }
}

type MatchOperations = ActiveMatchOperations | FinalizingMatchOperations

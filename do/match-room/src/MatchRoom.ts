import type { MatchCommand } from '@ks/core'
import { nowUnixEpochMilliseconds, type UnixEpochMilliseconds } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'

import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import { ActiveMatch } from './match/active-match'
import { FinalizingMatch } from './match/finalizing-match'
import { initializeMatch, type InitializeMatchInput } from './match/initialize-match'
import { MatchStorage } from './storage/match-storage'

export class MatchRoom extends DurableObject<Env> {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  readonly #activeMatch: ActiveMatch
  readonly #finalizingMatch: FinalizingMatch
  #disposedAt: UnixEpochMilliseconds | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.#storage = new MatchStorage(ctx.storage)
    this.#broadcaster = new Broadcaster()
    this.#activeMatch = new ActiveMatch(this.#storage, this.#broadcaster)
    this.#finalizingMatch = new FinalizingMatch(this.#storage, this.#broadcaster)
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
    return this.#activeMatch.submitCommand(command)
  }

  async getControls() {
    return this.#activeMatch.getControls()
  }

  async getProtocol() {
    return this.#activeMatch.getProtocol()
  }

  async stream(since?: number) {
    return this.#activeMatch.stream(since)
  }

  async prepareArchive() {
    return this.#finalizingMatch.prepareArchive()
  }

  async dispose(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.#disposedAt !== null) return
      this.#finalizingMatch.closeForDisposal()
      await this.ctx.storage.deleteAll()
      this.#disposedAt = nowUnixEpochMilliseconds()
      this.#activeMatch.clearResident()
    })
  }
}

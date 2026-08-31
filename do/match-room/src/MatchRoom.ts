import type { MatchCommand } from '@ks/core'
import { nowUnixEpochMilliseconds } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'

import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import { ActiveMatch } from './match/active-match'
import { FinalizingMatch } from './match/finalizing-match'
import { initializeMatch, type InitializeMatchInput } from './match/initialize-match'
import { MatchStorage } from './storage/match-storage'

const FINALIZED_ROOM_RETENTION_MS = 10 * 60 * 1000

export class MatchRoom extends DurableObject<Env> {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  readonly #activeMatch: ActiveMatch
  readonly #finalizingMatch: FinalizingMatch
  #disposed = false

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

  async finalize(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.#disposed) return
      const result = this.#finalizingMatch.closeForFinalization()
      if (result._tag === 'already-disposed') return
      if ((await this.ctx.storage.getAlarm()) === null) {
        await this.ctx.storage.setAlarm(nowUnixEpochMilliseconds() + FINALIZED_ROOM_RETENTION_MS)
      }
      this.#activeMatch.clearResident()
    })
  }

  async alarm(): Promise<void> {
    await this.#dispose()
  }

  async #dispose(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.#disposed) return
      const result = this.#finalizingMatch.prepareDisposal()
      if (result._tag === 'already-disposed') return
      await this.ctx.storage.deleteAll()
      this.#disposed = true
    })
  }
}

import type { MatchCommand } from '@ks/core'
import { nowUnixEpochMilliseconds } from '@ks/core'
import { DurableObject } from 'cloudflare:workers'

import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import { ActiveMatchOperations } from './match/active-match-operations'
import { FinalizingMatchOperations } from './match/finalizing-match-operations'
import { initializeMatch, type InitializeMatchInput } from './match/initialize-match'
import { ResidentMatch } from './match/resident-match'
import { MatchStorage, type StoredActiveMatch, type StoredFinalizingMatch } from './storage/match-storage'

const FINALIZED_ROOM_RETENTION_MS = 10 * 60 * 1000

export class MatchRoom extends DurableObject<Env> {
  readonly #storage: MatchStorage
  readonly #broadcaster: Broadcaster
  readonly #resident: ResidentMatch
  #currentPhase: MatchPhase | null = null
  #disposed = false

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.#storage = new MatchStorage(ctx.storage)
    this.#broadcaster = new Broadcaster()
    this.#resident = new ResidentMatch()
    ctx.blockConcurrencyWhile(async () => {
      this.#storage.migrate()
    })
  }

  async initialize(input: InitializeMatchInput) {
    if (this.ctx.id.name !== input.matchId)
      throw new Error('MatchRoom routed identity does not match initialization Match')
    const result = initializeMatch(this.#storage, input)
    if (result._tag === 'initialized') this.#currentPhase = null
    return result
  }

  async submitCommand(command: MatchCommand) {
    const phase = this.#requirePhase()
    if (phase.status === 'finalizing') return phase.operations.submitCommand(phase.stored, command)
    return phase.operations.submitCommand(phase.stored, command)
  }

  async getControls() {
    const phase = this.#requirePhase()
    return phase.status === 'active'
      ? phase.operations.getControls(phase.stored)
      : phase.operations.getControls()
  }

  async getProtocol() {
    const phase = this.#requirePhase()
    return phase.status === 'active'
      ? phase.operations.getProtocol(phase.stored)
      : phase.operations.getProtocol()
  }

  async stream(since?: number) {
    const phase = this.#requirePhase()
    return phase.status === 'active' ? phase.operations.stream(phase.stored, since) : phase.operations.stream()
  }

  async prepareArchive() {
    const phase = this.#requirePhase()
    if (phase.status === 'active') throw new Error('Cannot prepare archive for active Match')
    return phase.operations.prepareArchive(phase.stored)
  }

  async finalize(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.#disposed) return
      const phase = this.#readPhase()
      if (!phase) return
      if (phase.status === 'active') throw new Error('Cannot finalize active Match')
      phase.operations.closeForFinalization(phase.stored)
      if ((await this.ctx.storage.getAlarm()) === null)
        await this.ctx.storage.setAlarm(nowUnixEpochMilliseconds() + FINALIZED_ROOM_RETENTION_MS)
      this.#resident.clear()
    })
  }

  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.#disposed) return
      const phase = this.#readPhase()
      if (!phase) return
      if (phase.status === 'active') throw new Error('Cannot dispose active Match')
      await this.ctx.storage.deleteAll()
      this.#resident.clear()
      this.#currentPhase = null
      this.#disposed = true
    })
  }

  #requirePhase(): MatchPhase {
    const phase = this.#readPhase()
    if (!phase) throw new Error('MatchRoom storage missing')
    return phase
  }

  #readPhase(): MatchPhase | null {
    const stored = this.#storage.match()
    if (!stored) return null
    if (stored.status === 'active') {
      if (this.#currentPhase?.status !== 'active')
        this.#currentPhase = {
          status: 'active',
          operations: new ActiveMatchOperations(this.#storage, this.#broadcaster, this.#resident),
          stored,
        }
      else this.#currentPhase = { ...this.#currentPhase, stored }
      return this.#currentPhase
    }
    if (this.#currentPhase?.status !== 'finalizing')
      this.#currentPhase = {
        status: 'finalizing',
        operations: new FinalizingMatchOperations(this.#storage, this.#broadcaster, this.#resident),
        stored,
      }
    else this.#currentPhase = { ...this.#currentPhase, stored }
    return this.#currentPhase
  }
}

type MatchPhase =
  | {
      readonly status: 'active'
      readonly operations: ActiveMatchOperations
      readonly stored: StoredActiveMatch
    }
  | {
      readonly status: 'finalizing'
      readonly operations: FinalizingMatchOperations
      readonly stored: StoredFinalizingMatch
    }

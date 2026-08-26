import {
  buildMatchConfig,
  draftSparringMatchCreation,
  restoreSparringMatch,
  type SparringMatch,
  type SparringMatchRoomProjection,
} from '@ks/competition'
import {
  type CommandId,
  type MatchConfig,
  type MatchFact,
  type MatchFactContent,
  type MatchFactContentBatch,
  type MatchFactContentHistory,
  MatchFactSchema,
  newFactId,
  type StoredMatchFact,
  type UnixEpochMilliseconds,
} from '@ks/core'
import type { ControlCommandSections, MatchState } from '@ks/core'
import type { ControlProjectionFor, RegisteredGameKey } from '@ks/gameplay/definitions'
import { DurableObject } from 'cloudflare:workers'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import * as v from 'valibot'

import migrationsBundle from '../drizzle/migrations.js'
import type { Env } from './env'
import { Broadcaster } from './live/broadcaster'
import {
  canonicalCommandJson,
  type CreateBody,
  CreateBodySchema,
  type MatchIdBody,
  MatchIdBodySchema,
  type StreamBody,
  StreamBodySchema,
  type SubmitCommandBody,
  SubmitCommandBodySchema,
  type SubmitCommandResult,
} from './rpc-contract'
import { type ActiveMatchRecord, ActiveMatchStore } from './storage/active-match-store'
import type { CommandReceiptOutcome } from './storage/command-receipt'

type ResidentRoom = {
  readonly latestSeq: number
  readonly match: SparringMatch
}

type RoomReadSuccessFor<K extends RegisteredGameKey> = {
  ok: true
  state: MatchState & { gameKey: K }
  latestSeq: number
  controlProjection: ControlProjectionFor<K> | undefined
  controlSections: ControlCommandSections
}

type RoomReadSuccess = {
  [K in RegisteredGameKey]: RoomReadSuccessFor<K>
}[RegisteredGameKey]

type ReadMatchResult = RoomReadSuccess | { ok: false; error: string; status: number }

type ColdJournal = {
  match: ActiveMatchRecord
  facts: [StoredMatchFact, ...StoredMatchFact[]]
}

export class MatchRoom extends DurableObject<Env> {
  private readonly store: ActiveMatchStore
  private readonly live = new Broadcaster()
  private readonly ready: Promise<void>
  private resident: ResidentRoom | null = null
  private deleted = false

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.store = new ActiveMatchStore(ctx.storage)
    this.ready = ctx.blockConcurrencyWhile(async () => {
      migrate(this.store.db, migrationsBundle)
    })
  }

  async create(
    args: CreateBody,
  ): Promise<{ ok: true; matchId: MatchConfig['matchId'] } | { ok: false; error: string; status: number }> {
    await this.ready
    const parsed = v.safeParse(CreateBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid create body', status: 400 }
    return await this.ctx.blockConcurrencyWhile(async () => {
      const config = buildMatchConfig(parsed.output.matchId, parsed.output)
      const configJson = JSON.stringify(config)
      let match = this.store.match()
      if (match) {
        if (
          match.matchId !== parsed.output.matchId ||
          match.controlSecret !== parsed.output.controlSecret ||
          JSON.stringify(match.config) !== configJson ||
          match.createdAt !== parsed.output.createdAt
        ) {
          return { ok: false, error: 'Match already exists', status: 409 }
        }
      } else {
        this.commitCreation(config, {
          matchId: parsed.output.matchId,
          controlSecret: parsed.output.controlSecret,
          configJson,
          createdAt: parsed.output.createdAt,
        })
        match = this.store.match()
      }

      if (!match) throw new Error('Failed to initialize active match')
      return { ok: true, matchId: parsed.output.matchId }
    })
  }

  /**
   * Returns the active semantic projection with the independently persisted cursor.
   * A cold read validates and restores the complete journal; finalizing and deleted rooms are unavailable through this RPC.
   */
  async readMatch(args: MatchIdBody): Promise<ReadMatchResult> {
    await this.ready
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid match ID body', status: 400 }
    if (this.deleted) return { ok: false, error: 'Unknown match', status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status === 'finalizing') {
      return { ok: false, error: 'Match is finalizing', status: 409 }
    }
    const resident = this.loadResident()
    return { ok: true, ...resident.match.project(), latestSeq: match.latestSeq }
  }

  /**
   * Executes one control command serially, returning a matching durable receipt before resident execution.
   * Accepted execution advances resident state speculatively; facts, cursor, finalizing status, and receipt then commit
   * atomically before broadcast. Any execution, enveloping, or persistence defect discards the resident for cold restore.
   */
  async submitCommand(args: SubmitCommandBody): Promise<SubmitCommandResult> {
    await this.ready
    const body = v.safeParse(SubmitCommandBodySchema, args)
    if (!body.success) return { ok: false, error: 'invalid-command-body', status: 400 }

    return await this.ctx.blockConcurrencyWhile(async () => this.submitCommandLocked(body.output))
  }

  private submitCommandLocked(body: v.InferOutput<typeof SubmitCommandBodySchema>): SubmitCommandResult {
    if (this.deleted) return { ok: false, error: 'match-locked', status: 409 }
    const match = this.store.match()
    if (!match || match.matchId !== body.matchId) return { ok: false, error: 'unknown-match', status: 400 }

    const requestJson = canonicalCommandJson(body.command)
    const previous = this.store.receipt(body.commandId)
    if (previous) {
      if (previous.requestJson !== requestJson) {
        return { ok: false, error: 'command-id-conflict', status: 409 }
      }
      return this.submitSuccess(previous.outcome, match.status)
    }

    if (match.status === 'finalizing') {
      return { ok: false, error: 'match-locked', status: 409 }
    }

    const resident = this.loadResident()
    let commandResult
    try {
      commandResult = resident.match.execute(body.command)
    } catch (error) {
      this.clearResident()
      throw error
    }
    if (commandResult._tag === 'parse-failed') {
      return { ok: false, error: 'invalid-command-body', status: 400 }
    }

    if (commandResult._tag === 'rejected') {
      const outcome = this.store.commitRejected({
        receipt: { commandId: body.commandId, requestJson },
        reason: commandResult.reason,
      })
      return this.submitSuccess(outcome, match.status)
    }

    try {
      const facts = this.envelopeContents(commandResult.facts, match.matchId, body.commandId)
      const committed = this.store.commitAccepted({
        facts: this.nonemptyFacts(facts),
        receipt: { commandId: body.commandId, requestJson },
        expectedLatestSeq: resident.latestSeq,
      })
      const lastStoredFact = committed.storedFacts[committed.storedFacts.length - 1]!
      this.resident = { latestSeq: lastStoredFact.seq, match: resident.match }
      for (const fact of committed.storedFacts) {
        if (fact.type !== 'match.ended') this.live.broadcast(fact)
      }
      const matchStatus = committed.storedFacts.some((fact) => fact.type === 'match.ended') ? 'finalizing' : match.status
      return this.submitSuccess(committed.outcome, matchStatus)
    } catch (error) {
      this.clearResident()
      throw error
    }
  }

  async stream(args: StreamBody): Promise<Response> {
    await this.ready
    const parsed = v.safeParse(StreamBodySchema, args)
    if (!parsed.success) return Response.json({ ok: false, error: 'Invalid stream body' }, { status: 400 })
    if (this.deleted) return Response.json({ ok: false, error: 'Unknown match' }, { status: 400 })
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId)
      return Response.json({ ok: false, error: 'Unknown match' }, { status: 400 })
    if (match.status === 'finalizing') {
      return Response.json({ ok: false, error: 'Match is finalizing' }, { status: 409 })
    }
    return this.live.stream(match.latestSeq, this.store.factsAfter(parsed.output.since ?? 0))
  }

  async listFacts(
    args: MatchIdBody,
  ): Promise<{ ok: true; facts: StoredMatchFact[] } | { ok: false; error: string; status: number }> {
    await this.ready
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid facts body', status: 400 }
    if (this.deleted) return { ok: false, error: 'Unknown match', status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status === 'finalizing') {
      return { ok: false, error: 'Match is finalizing', status: 409 }
    }
    return { ok: true, facts: this.store.factsAfter(0) }
  }

  /**
   * Returns archive input only for a finalizing match after validating and restoring its complete durable journal.
   * The returned terminal acceptance time is authoritative for `endedAt`; this operation does not archive or delete the room.
   */
  async finalization(args: MatchIdBody): Promise<
    | {
        ok: true
        data: {
          sourceLatestSeq: number
          endedAt: UnixEpochMilliseconds
          facts: StoredMatchFact[]
          projection: SparringMatchRoomProjection
        }
      }
    | { ok: false; error: string; status: number }
  > {
    await this.ready
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid finalize body', status: 400 }
    if (this.deleted) return { ok: false, error: 'Unknown match', status: 400 }
    const match = this.store.match()
    if (!match || match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
    if (match.status !== 'finalizing') return { ok: false, error: 'Match is active', status: 409 }

    const { match: validatedMatch, facts } = this.readColdJournal(match)
    const terminalFact = facts[facts.length - 1]!
    if (terminalFact.type !== 'match.ended') throw new Error('Missing terminal fact')

    const resident = this.ensureResident(validatedMatch.latestSeq, facts)

    return {
      ok: true,
      data: {
        sourceLatestSeq: validatedMatch.latestSeq,
        endedAt: terminalFact.acceptedAt,
        facts: [...facts],
        projection: resident.match.project(),
      },
    }
  }

  /**
   * Destructively disposes a finalizing room after the application has durably archived it.
   * The complete local journal is decoded and must belong to this room with `match.ended` at its persisted tail; semantic
   * replay is intentionally not repeated. The terminal fact is broadcast, streams are closed, and local storage is deleted.
   */
  async disposeFinalized(args: MatchIdBody): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    await this.ready
    const parsed = v.safeParse(MatchIdBodySchema, args)
    if (!parsed.success) return { ok: false, error: 'Invalid dispose body', status: 400 }
    return await this.ctx.blockConcurrencyWhile(async () => {
      if (this.deleted) return { ok: true }
      const match = this.store.match()
      if (match && match.matchId !== parsed.output.matchId) return { ok: false, error: 'Unknown match', status: 400 }
      if (match?.status === 'active') return { ok: false, error: 'Match is active', status: 409 }

      if (match) {
        const { facts } = this.readColdJournal(match)
        if (facts.some((fact) => fact.matchId !== match.matchId)) throw new Error('Active match journal envelope mismatch')
        const terminalFact = facts[facts.length - 1]!
        if (terminalFact.type !== 'match.ended') throw new Error('Missing terminal fact')
        this.live.broadcast(terminalFact)
      }
      this.live.closeAll()
      await this.ctx.storage.deleteAll()
      this.deleted = true
      this.clearResident()
      return { ok: true }
    })
  }

  private envelopeContents(
    drafts: readonly [MatchFactContent, ...MatchFactContent[]],
    matchId: MatchConfig['matchId'],
    commandId: CommandId,
  ): [MatchFact, ...MatchFact[]] {
    const facts = drafts.map((draft) =>
      v.parse(MatchFactSchema, {
        factId: newFactId(),
        matchId,
        causedByCommandId: commandId,
        type: draft.type,
        payload: draft.payload,
      }),
    )
    return this.nonemptyFacts(facts)
  }

  private creationFact(config: MatchConfig): MatchFact {
    const draft = draftSparringMatchCreation(config)
    return {
      factId: newFactId(),
      matchId: config.matchId,
      causedByCommandId: null,
      type: draft.type,
      payload: draft.payload,
    }
  }

  private nonemptyFacts(facts: MatchFact[]): [MatchFact, ...MatchFact[]] {
    if (facts.length === 0) throw new Error('Expected non-empty facts')
    return [facts[0]!, ...facts.slice(1)]
  }

  private submitSuccess(
    outcome: CommandReceiptOutcome,
    matchStatus: ActiveMatchRecord['status'],
  ): Extract<SubmitCommandResult, { ok: true }> {
    if (outcome._tag === 'rejected') return { ok: true, outcome }
    if (matchStatus === 'finalizing') return { ok: true, outcome, finalizing: true }
    return { ok: true, outcome }
  }

  private storedFacts(facts: StoredMatchFact[]): [StoredMatchFact, ...StoredMatchFact[]] {
    if (facts.length === 0) throw new Error('Active match journal is empty')
    return [facts[0]!, ...facts.slice(1)]
  }

  private readColdJournal(match: ActiveMatchRecord): ColdJournal {
    const facts = this.storedFacts(this.store.factsAfter(0))
    const lastFact = facts[facts.length - 1]!
    if (lastFact.seq !== match.latestSeq) {
      throw new Error('Active match journal tail sequence mismatch')
    }
    return { match, facts }
  }

  private semanticHistory(match: ActiveMatchRecord, facts: [StoredMatchFact, ...StoredMatchFact[]]): MatchFactContentHistory {
    const batches: MatchFactContentBatch[] = []
    const seen = new Set<string>()
    let commandId: string | null = null
    let acceptedAt: number | null = null
    for (let index = 0; index < facts.length; index += 1) {
      const fact = facts[index]!
      if (fact.seq !== index + 1 || fact.matchId !== match.matchId) throw new Error('Active match journal envelope mismatch')
      // SAFETY: StoredMatchFactSchema already correlated each fact discriminator with its payload in the storage adapter.
      const content = { type: fact.type, payload: fact.payload } as MatchFactContent
      if (index === 0) {
        if (fact.type !== 'match.created' || fact.causedByCommandId !== null)
          throw new Error('Active match journal must begin with singleton match.created')
        if (JSON.stringify(fact.payload) !== JSON.stringify(match.config))
          throw new Error('Active match journal creation does not match active config')
        batches.push([content])
        continue
      }
      if (fact.type === 'match.created' || fact.causedByCommandId === null)
        throw new Error('Active match journal command causation mismatch')
      if (fact.causedByCommandId !== commandId) {
        if (seen.has(fact.causedByCommandId)) throw new Error('Active match journal command causation recurs')
        seen.add(fact.causedByCommandId)
        batches.push([content])
        commandId = fact.causedByCommandId
        acceptedAt = fact.acceptedAt
      } else if (fact.acceptedAt !== acceptedAt) throw new Error('Active match journal batch timestamp mismatch')
      else {
        const current = batches.at(-1)
        if (!current) throw new Error('Active match journal command batch is missing')
        batches[batches.length - 1] = [...current, content]
      }
    }
    const [first, ...rest] = batches
    if (!first) throw new Error('Active match journal has no semantic batches')
    return [first, ...rest]
  }

  private ensureResident(latestSeq: number, facts: [StoredMatchFact, ...StoredMatchFact[]]): ResidentRoom {
    if (this.resident?.latestSeq === latestSeq) return this.resident
    this.clearResident()
    try {
      const matchRecord = this.store.match()
      if (!matchRecord) throw new Error('Unknown match')
      const residentMatch = restoreSparringMatch(this.semanticHistory(matchRecord, facts))
      this.resident = { latestSeq, match: residentMatch }
      return this.resident
    } catch (error) {
      this.resident = null
      throw error
    }
  }

  private loadResident(): ResidentRoom {
    const match = this.store.match()
    if (!match) throw new Error('Unknown match')
    if (this.resident?.latestSeq === match.latestSeq) return this.resident
    this.clearResident()
    const { facts } = this.readColdJournal(match)
    return this.ensureResident(match.latestSeq, facts)
  }

  private clearResident(): void {
    this.resident = null
  }

  private commitCreation(
    config: MatchConfig,
    initialization: {
      matchId: MatchConfig['matchId']
      controlSecret: string
      configJson: string
      createdAt: UnixEpochMilliseconds
    },
  ): StoredMatchFact {
    const storedFact = this.store.commitCreation({ initialization, fact: this.creationFact(config) })
    if (storedFact.type !== 'match.created') throw new Error('Creation commit did not return match.created')
    const content: MatchFactContent = { type: storedFact.type, payload: storedFact.payload }
    const residentMatch = restoreSparringMatch([[content]])
    this.resident = { latestSeq: 1, match: residentMatch }
    this.live.broadcast(storedFact)
    return storedFact
  }
}

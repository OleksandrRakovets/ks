import {
  AcceptedFactSchema,
  type ClientFact,
  nowUnixEpochMilliseconds,
  type StoredFact,
  StoredFactSchema,
  type UnixEpochMilliseconds,
} from '@ks/core'
import { asc, eq, gt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import * as v from 'valibot'

import * as schema from './schema'

export type Accepted = { seq: number; factId: string }
export type ActiveMatchRecord = typeof schema.activeMatches.$inferSelect
export type Receipt = { requestJson: string; accepted: Accepted[] }

type Initialization = {
  matchId: string
  controlSecret: string
  configJson: string
  createdAt: UnixEpochMilliseconds
}

type CommitReceipt = {
  commandId: string
  requestJson: string
}

type CommitResult = {
  accepted: Accepted[]
  storedFacts: StoredFact[]
}

export class ActiveMatchStore {
  readonly db

  constructor(storage: DurableObjectStorage) {
    this.db = drizzle(storage)
  }

  match(): ActiveMatchRecord | null {
    return this.db.select().from(schema.activeMatches).limit(1).all()[0] ?? null
  }

  factsAfter(since: number): StoredFact[] {
    const match = this.match()
    if (!match) return []
    return this.db
      .select()
      .from(schema.acceptedFacts)
      .where(gt(schema.acceptedFacts.seq, since))
      .orderBy(asc(schema.acceptedFacts.seq))
      .all()
      .flatMap((row) => {
        const payload = v.safeParse(v.pipe(v.string(), v.parseJson()), row.payloadJson)
        if (!payload.success) return []
        const fact = v.safeParse(StoredFactSchema, {
          seq: row.seq,
          factId: row.factId,
          matchId: match.matchId,
          clientId: row.clientId,
          clientSeq: row.clientSeq,
          at: row.at,
          receivedAt: row.receivedAt,
          type: row.type,
          payload: payload.output,
        })
        return fact.success ? [fact.output] : []
      })
  }

  factsForAccepted(accepted: Accepted[]): StoredFact[] {
    if (accepted.length === 0) return []
    const firstSequence = accepted.reduce((lowest, { seq }) => Math.min(lowest, seq), Number.POSITIVE_INFINITY)
    return this.factsAfter(firstSequence - 1).slice(0, accepted.length)
  }

  receipt(commandId: string): Receipt | null {
    const row = this.db
      .select()
      .from(schema.commandReceipts)
      .where(eq(schema.commandReceipts.commandId, commandId))
      .limit(1)
      .all()[0]
    if (!row) return null
    const accepted = v.safeParse(v.pipe(v.string(), v.parseJson(), v.array(AcceptedFactSchema)), row.acceptedJson)
    return accepted.success ? { requestJson: row.requestJson, accepted: accepted.output } : null
  }

  commitAccepted(args: { facts: ClientFact[]; receipt: CommitReceipt | null; initialization?: Initialization }): CommitResult {
    const existingMatch = this.match()
    if (!existingMatch && !args.initialization) throw new Error('Unknown match')
    if (existingMatch && args.initialization) throw new Error('Match already exists')

    const matchId = existingMatch?.matchId ?? args.initialization?.matchId
    if (!matchId) throw new Error('Missing match ID')

    const receivedAt = nowUnixEpochMilliseconds()
    let nextSequence = existingMatch?.latestSeq ?? 0
    const storedFacts = args.facts.map((fact) => {
      nextSequence += 1
      return v.parse(StoredFactSchema, { ...fact, seq: nextSequence, receivedAt })
    })

    const accepted = storedFacts.map(({ seq, factId }) => ({ seq, factId }))

    return this.db.transaction((transaction) => {
      if (args.initialization) {
        transaction
          .insert(schema.activeMatches)
          .values({ ...args.initialization, latestSeq: 0, status: 'active' })
          .run()
      }

      for (const fact of storedFacts) {
        transaction
          .insert(schema.acceptedFacts)
          .values({
            seq: fact.seq,
            factId: fact.factId,
            type: fact.type,
            payloadJson: JSON.stringify(fact.payload),
            clientId: fact.clientId,
            clientSeq: fact.clientSeq,
            at: fact.at,
            receivedAt: fact.receivedAt,
          })
          .run()
      }

      transaction
        .update(schema.activeMatches)
        .set({
          latestSeq: nextSequence,
          status: storedFacts.some((fact) => fact.type === 'match.ended') ? 'finalizing' : (existingMatch?.status ?? 'active'),
        })
        .where(eq(schema.activeMatches.matchId, matchId))
        .run()

      if (args.receipt) {
        transaction
          .insert(schema.commandReceipts)
          .values({
            commandId: args.receipt.commandId,
            requestJson: args.receipt.requestJson,
            acceptedJson: JSON.stringify(accepted),
          })
          .run()
      }

      return { accepted, storedFacts }
    })
  }
}

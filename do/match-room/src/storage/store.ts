import { StoredFactSchema, type ClientFact, type StoredFact } from '@ks/core'
import { asc, eq, gt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import * as v from 'valibot'

import * as schema from './schema'

export type Receipt = { requestJson: string; accepted: { seq: number; factId: string }[] }

export class ActiveMatchStore {
  readonly db
  private readonly storage: DurableObjectStorage

  constructor(storage: DurableObjectStorage) {
    this.storage = storage
    // SAFETY: durable-sqlite accepts the runtime schema; RC.4's declaration omits the schema config generic.
    this.db = drizzle(storage, { schema } as never)
  }

  match(): { matchId: string; controlSecret: string; configJson: string; latestSeq: number } | null {
    const row = this.db.select().from(schema.activeMatches).get()
    return row ?? null
  }

  create(matchId: string, controlSecret: string, configJson: string): void {
    this.db.insert(schema.activeMatches).values({ matchId, controlSecret, configJson, latestSeq: 0 }).run()
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

  receipt(commandId: string): Receipt | null {
    const row = this.db.select().from(schema.commandReceipts).where(eq(schema.commandReceipts.commandId, commandId)).get()
    if (!row) return null
    const accepted = v.safeParse(
      v.pipe(v.string(), v.parseJson(), v.array(v.object({ seq: v.number(), factId: v.string() }))),
      row.acceptedJson,
    )
    return accepted.success ? { requestJson: row.requestJson, accepted: accepted.output } : null
  }

  commit(facts: ClientFact[], receipt: { commandId: string; requestJson: string; accepted: Receipt['accepted'] } | null): void {
    const match = this.match()
    if (!match) throw new Error('Unknown match')
    this.storage.transactionSync(() => {
      let seq = match.latestSeq
      const receivedAt = Date.now()
      for (const fact of facts) {
        seq += 1
        this.db
          .insert(schema.acceptedFacts)
          .values({
            seq,
            factId: fact.factId,
            type: fact.type,
            payloadJson: JSON.stringify(fact.payload),
            clientId: fact.clientId,
            clientSeq: fact.clientSeq,
            at: fact.at,
            receivedAt,
          })
          .run()
      }
      this.db.update(schema.activeMatches).set({ latestSeq: seq }).where(eq(schema.activeMatches.matchId, match.matchId)).run()
      if (receipt)
        this.db
          .insert(schema.commandReceipts)
          .values({
            commandId: receipt.commandId,
            requestJson: receipt.requestJson,
            acceptedJson: JSON.stringify(receipt.accepted),
          })
          .run()
    })
  }
}

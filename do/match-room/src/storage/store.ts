import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import * as v from 'valibot'

import { migrationsBundle } from '../../drizzle/migrations'
import * as schema from './schema'
import { StoredFactSchema, type ClientFact, type StoredFact } from '@ks/core'

export type Receipt = { requestJson: string; accepted: { seq: number; factId: string }[] }

export class ActiveMatchStore {
  readonly db
  private readonly storage: DurableObjectStorage

  constructor(storage: DurableObjectStorage) {
    this.storage = storage
    this.db = drizzle(storage, { schema } as never)
    migrate(this.db, migrationsBundle)
  }

  match(): { matchId: string; controlSecret: string; configJson: string; latestSeq: number } | null {
    const row = this.storage.sql.exec('SELECT match_id, control_secret, config_json, latest_seq FROM active_matches LIMIT 1').one()
    return row ? { matchId: String(row.match_id), controlSecret: String(row.control_secret), configJson: String(row.config_json), latestSeq: Number(row.latest_seq) } : null
  }

  create(matchId: string, controlSecret: string, configJson: string): void {
    this.storage.sql.exec('INSERT INTO active_matches (match_id, control_secret, config_json, latest_seq) VALUES (?, ?, ?, 0)', matchId, controlSecret, configJson)
  }

  factsAfter(since: number): StoredFact[] {
    return this.storage.sql.exec('SELECT * FROM accepted_facts WHERE seq > ? ORDER BY seq ASC', since).toArray().flatMap((row) => {
      const payload = v.safeParse(v.pipe(v.string(), v.parseJson()), String(row.payload_json))
      if (!payload.success) return []
      const fact = v.safeParse(StoredFactSchema, { seq: row.seq, factId: row.fact_id, matchId: this.match()?.matchId, clientId: row.client_id, clientSeq: row.client_seq, at: row.at, receivedAt: row.received_at, type: row.type, payload: payload.output })
      return fact.success ? [fact.output] : []
    })
  }

  receipt(commandId: string): Receipt | null {
    const row = this.storage.sql.exec('SELECT request_json, accepted_json FROM command_receipts WHERE command_id = ?', commandId).one()
    return row ? { requestJson: String(row.request_json), accepted: JSON.parse(String(row.accepted_json)) as Receipt['accepted'] } : null
  }

  commit(facts: ClientFact[], receipt: { commandId: string; requestJson: string; accepted: Receipt['accepted'] } | null): void {
    const match = this.match()
    if (!match) throw new Error('Unknown match')
    this.storage.transactionSync(() => {
      let seq = match.latestSeq
      const receivedAt = Date.now()
      for (const fact of facts) {
        seq += 1
        this.storage.sql.exec('INSERT INTO accepted_facts (seq, fact_id, type, payload_json, client_id, client_seq, at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', seq, fact.factId, fact.type, JSON.stringify(fact.payload), fact.clientId, fact.clientSeq, fact.at, receivedAt)
      }
      this.storage.sql.exec('UPDATE active_matches SET latest_seq = ?', seq)
      if (receipt) this.storage.sql.exec('INSERT INTO command_receipts (command_id, request_json, accepted_json) VALUES (?, ?, ?)', receipt.commandId, receipt.requestJson, JSON.stringify(receipt.accepted))
    })
  }
}

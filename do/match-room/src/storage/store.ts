import type { SparringMatchRejection } from '@ks/competition'
import {
  type CommandId,
  type MatchFact,
  type MatchId,
  nowUnixEpochMilliseconds,
  type StoredMatchFact,
  StoredMatchFactSchema,
  type UnixEpochMilliseconds,
} from '@ks/core'
import { asc, eq, gt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import * as v from 'valibot'

import {
  type CommandReceipt,
  type CommandReceiptOutcome,
  decodeCommandReceiptRow,
  encodeCommandReceiptOutcome,
} from './command-receipt'
import * as schema from './schema'
import { decodeStoredMatchFactRow, encodeStoredMatchFactRow } from './stored-match-fact-row'

export type ActiveMatchRecord = typeof schema.activeMatches.$inferSelect

export type ActiveMatchInitialization = {
  readonly matchId: MatchId
  readonly controlSecret: string
  readonly configJson: string
  readonly createdAt: UnixEpochMilliseconds
}

type CommitReceipt = {
  readonly commandId: CommandId
  readonly requestJson: string
}

function assertCreationFact(fact: MatchFact, initialization: ActiveMatchInitialization): void {
  if (fact.type !== 'match.created') throw new Error('Creation commit requires match.created')
  if (fact.causedByCommandId !== null) throw new Error('Creation fact must not carry command causation')
  if (fact.matchId !== initialization.matchId) throw new Error('Creation fact match ID mismatch')
  if (fact.payload.matchId !== initialization.matchId) throw new Error('Creation payload match ID mismatch')
}

function assertCommandFacts(facts: readonly [MatchFact, ...MatchFact[]], matchId: MatchId, commandId: CommandId): void {
  for (const fact of facts) {
    if (fact.type === 'match.created') throw new Error('Command commit cannot include match.created')
    if (fact.matchId !== matchId) throw new Error('Fact match ID mismatch')
    if (fact.causedByCommandId !== commandId) throw new Error('Fact causation mismatch')
  }
}

export class ActiveMatchStore {
  readonly db

  constructor(storage: DurableObjectStorage) {
    this.db = drizzle(storage)
  }

  match(): ActiveMatchRecord | null {
    return this.db.select().from(schema.activeMatches).limit(1).all()[0] ?? null
  }

  factsAfter(since: number): StoredMatchFact[] {
    const rows = this.db
      .select()
      .from(schema.acceptedFacts)
      .where(gt(schema.acceptedFacts.seq, since))
      .orderBy(asc(schema.acceptedFacts.seq))
      .all()
    return rows.map((row) => {
      try {
        return decodeStoredMatchFactRow(row)
      } catch {
        throw new Error(`MatchRoom accepted_facts storage corruption at sequence ${String(row.seq)}`)
      }
    })
  }

  receipt(commandId: CommandId): CommandReceipt | null {
    const row = this.db
      .select()
      .from(schema.commandReceipts)
      .where(eq(schema.commandReceipts.commandId, commandId))
      .limit(1)
      .all()[0]
    if (!row) return null
    return decodeCommandReceiptRow(row, commandId)
  }

  commitCreation(args: { readonly initialization: ActiveMatchInitialization; readonly fact: MatchFact }): StoredMatchFact {
    if (this.match()) throw new Error('Match already exists')
    assertCreationFact(args.fact, args.initialization)

    const receivedAt = nowUnixEpochMilliseconds()
    const storedFact = v.parse(StoredMatchFactSchema, { ...args.fact, seq: 1, receivedAt })

    return this.db.transaction((transaction) => {
      transaction
        .insert(schema.activeMatches)
        .values({ ...args.initialization, latestSeq: 1, status: 'active' })
        .run()
      transaction.insert(schema.acceptedFacts).values(encodeStoredMatchFactRow(storedFact)).run()
      return storedFact
    })
  }

  commitAccepted(args: { readonly facts: readonly [MatchFact, ...MatchFact[]]; readonly receipt: CommitReceipt }): {
    readonly outcome: Extract<CommandReceiptOutcome, { _tag: 'accepted' }>
    readonly storedFacts: readonly [StoredMatchFact, ...StoredMatchFact[]]
  } {
    const existingMatch = this.match()
    if (!existingMatch || existingMatch.status !== 'active') throw new Error('Match is not active')
    assertCommandFacts(args.facts, existingMatch.matchId, args.receipt.commandId)

    const receivedAt = nowUnixEpochMilliseconds()
    let nextSequence = existingMatch.latestSeq
    const [head, ...tail] = args.facts
    nextSequence += 1
    const storedHead = v.parse(StoredMatchFactSchema, { ...head, seq: nextSequence, receivedAt })
    const storedTail = tail.map((fact) => {
      nextSequence += 1
      return v.parse(StoredMatchFactSchema, { ...fact, seq: nextSequence, receivedAt })
    })
    const storedFacts: [StoredMatchFact, ...StoredMatchFact[]] = [storedHead, ...storedTail]

    const outcome: Extract<CommandReceiptOutcome, { _tag: 'accepted' }> = {
      _tag: 'accepted',
      accepted: storedFacts.map(({ seq, factId }) => ({ seq, factId })),
    }

    return this.db.transaction((transaction) => {
      for (const fact of storedFacts) {
        transaction.insert(schema.acceptedFacts).values(encodeStoredMatchFactRow(fact)).run()
      }

      transaction
        .update(schema.activeMatches)
        .set({
          latestSeq: nextSequence,
          status: storedFacts.some((fact) => fact.type === 'match.ended') ? 'finalizing' : existingMatch.status,
        })
        .where(eq(schema.activeMatches.matchId, existingMatch.matchId))
        .run()

      transaction
        .insert(schema.commandReceipts)
        .values({
          commandId: args.receipt.commandId,
          requestJson: args.receipt.requestJson,
          outcomeJson: encodeCommandReceiptOutcome(outcome),
        })
        .run()

      return { outcome, storedFacts }
    })
  }

  commitRejected(args: {
    readonly receipt: CommitReceipt
    readonly reason: SparringMatchRejection
  }): Extract<CommandReceiptOutcome, { _tag: 'rejected' }> {
    const existingMatch = this.match()
    if (!existingMatch) throw new Error('Unknown match')

    const outcome: Extract<CommandReceiptOutcome, { _tag: 'rejected' }> = {
      _tag: 'rejected',
      reason: args.reason,
    }

    return this.db.transaction((transaction) => {
      transaction
        .insert(schema.commandReceipts)
        .values({
          commandId: args.receipt.commandId,
          requestJson: args.receipt.requestJson,
          outcomeJson: encodeCommandReceiptOutcome(outcome),
        })
        .run()
      return outcome
    })
  }
}

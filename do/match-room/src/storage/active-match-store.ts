import { type SparringMatchRejection, SparringMatchRejectionSchema } from '@ks/competition'
import {
  type AcceptedCommandHistoryEntry,
  type AcceptedCommandStreamUpdate,
  type CommandId,
  MatchCommand,
  MatchConfigSchema,
  type MatchId,
  MatchIdSchema,
  type MatchState,
  MatchStateSchema,
  type NonEmptyProtocolEntries,
  NonNegativeIntegerSchema,
  nowUnixEpochMilliseconds,
  type ProtocolEntry,
  ProtocolEntrySchema,
  type StoredProtocolEntry,
  StoredProtocolEntrySchema,
  type UnixEpochMilliseconds,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import { RegisteredGameKeySchema } from '@ks/gameplay/definitions'
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import * as v from 'valibot'

import { type CommandReceiptOutcome, decodeStoredCommandOutcome, type StoredCommandOutcome } from './command-outcome'
import * as schema from './schema'

const ActiveMatchRecordSchema = v.pipe(
  v.object({
    matchId: MatchIdSchema,
    controlSecret: v.pipe(v.string(), v.minLength(16)),
    configJson: v.pipe(
      v.string(),
      v.parseJson(),
      v.intersect([MatchConfigSchema, v.object({ gameKey: RegisteredGameKeySchema })]),
    ),
    latestSeq: NonNegativeIntegerSchema,
    status: v.picklist(['active', 'finalizing']),
    createdAt: UnixEpochMillisecondsSchema,
    finalStateJson: v.nullable(v.pipe(v.string(), v.parseJson(), MatchStateSchema)),
    endedAt: v.nullable(UnixEpochMillisecondsSchema),
  }),
  v.transform(({ configJson, finalStateJson, ...row }) => ({ ...row, config: configJson, finalState: finalStateJson })),
  v.check(
    (row) =>
      row.matchId === row.config.matchId &&
      (row.status === 'active'
        ? row.finalState === null && row.endedAt === null
        : row.finalState?.status === 'finished' && row.endedAt !== null) &&
      (row.finalState === null || (row.finalState.matchId === row.matchId && row.finalState.gameKey === row.config.gameKey)),
  ),
)

export type ActiveMatchRecord = v.InferOutput<typeof ActiveMatchRecordSchema>
export type ActiveMatchInitialization = {
  readonly matchId: MatchId
  readonly controlSecret: string
  readonly configJson: string
  readonly createdAt: UnixEpochMilliseconds
}

function decodeEntry(row: typeof schema.protocolEntries.$inferSelect): StoredProtocolEntry {
  return v.parse(StoredProtocolEntrySchema, {
    acceptedSeq: row.acceptedSeq,
    entryIndex: row.entryIndex,
    causedByCommandId: row.causedByCommandId,
    acceptedAt: row.acceptedAt,
    frameIndex: row.frameIndex ?? undefined,
    source: row.source,
    entryType: row.entryType,
    seat: row.seat,
    scoreAfter: row.scoreA === null || row.scoreB === null ? undefined : { A: row.scoreA, B: row.scoreB },
    bodyJson: row.bodyJson,
  })
}

function storedToSemanticEntry(entry: StoredProtocolEntry): ProtocolEntry {
  return v.parse(ProtocolEntrySchema, {
    frameIndex: entry.frameIndex,
    source: entry.source,
    entryType: entry.entryType,
    seat: entry.seat,
    scoreAfter: entry.scoreAfter,
    body: JSON.parse(entry.bodyJson),
  })
}

export class ActiveMatchStore {
  readonly db
  constructor(storage: DurableObjectStorage) {
    this.db = drizzle(storage)
  }

  match(): ActiveMatchRecord | null {
    const row = this.db.select().from(schema.activeMatches).limit(1).all()[0]
    if (!row) return null
    try {
      return v.parse(ActiveMatchRecordSchema, row)
    } catch {
      throw new Error('MatchRoom active_matches storage corruption')
    }
  }

  commandOutcome(commandId: CommandId): StoredCommandOutcome | null {
    const row = this.db.select().from(schema.commands).where(eq(schema.commands.commandId, commandId)).limit(1).all()[0]
    return row ? decodeStoredCommandOutcome(row, commandId) : null
  }

  protocolEntriesThrough(latestSeq: number): StoredProtocolEntry[] {
    try {
      return this.db
        .select()
        .from(schema.protocolEntries)
        .where(lte(schema.protocolEntries.acceptedSeq, latestSeq))
        .orderBy(asc(schema.protocolEntries.acceptedSeq), asc(schema.protocolEntries.entryIndex))
        .all()
        .map(decodeEntry)
    } catch {
      throw new Error('MatchRoom protocol_entries storage corruption')
    }
  }

  history(match: ActiveMatchRecord): AcceptedCommandHistoryEntry[] {
    const commands = this.db
      .select()
      .from(schema.commands)
      .where(isNotNull(schema.commands.acceptedSeq))
      .orderBy(asc(schema.commands.acceptedSeq))
      .all()
    const entries = this.protocolEntriesThrough(match.latestSeq)
    let expected = 1
    return commands
      .map((row) => {
        if (row.outcome !== 'accepted' || row.acceptedSeq !== expected || row.acceptedAt === null)
          throw new Error('MatchRoom commands storage corruption')
        const owned = entries.filter((entry) => entry.acceptedSeq === expected)
        if (
          !owned.length ||
          owned.some(
            (entry, index) =>
              entry.entryIndex !== index || entry.causedByCommandId !== row.commandId || entry.acceptedAt !== row.acceptedAt,
          )
        )
          throw new Error('MatchRoom protocol_entries storage corruption')
        expected += 1
        const command = v.safeParse(v.pipe(v.string(), v.parseJson(), MatchCommand), row.requestJson)
        if (!command.success) throw new Error('MatchRoom commands storage corruption')
        return { command: command.output, protocolEntries: owned.map(storedToSemanticEntry) }
      })
      .concat(
        expected - 1 === match.latestSeq
          ? []
          : (() => {
              throw new Error('Active match command tail sequence mismatch')
            })(),
      )
  }

  liveUpdatesAfter(since: number, through: number): AcceptedCommandStreamUpdate[] {
    const entries = this.protocolEntriesThrough(through).filter((entry) => entry.acceptedSeq > since)
    const updates: AcceptedCommandStreamUpdate[] = []
    for (let seq = since + 1; seq <= through; seq += 1) {
      const batch = entries.filter((entry) => entry.acceptedSeq === seq).map(storedToSemanticEntry)
      if (!batch[0]) throw new Error('MatchRoom protocol_entries storage corruption')
      updates.push({ type: 'command-accepted', acceptedSeq: seq, entries: [batch[0], ...batch.slice(1)], terminal: false })
    }
    return updates
  }

  commitCreation(initialization: ActiveMatchInitialization): void {
    this.db
      .insert(schema.activeMatches)
      .values({ ...initialization, latestSeq: 0, status: 'active', finalStateJson: null, endedAt: null })
      .run()
  }

  commitRejected(args: {
    matchId: MatchId
    commandId: CommandId
    requestJson: string
    reason: SparringMatchRejection
  }): Extract<CommandReceiptOutcome, { _tag: 'rejected' }> {
    const reason = v.parse(SparringMatchRejectionSchema, args.reason)
    this.db
      .insert(schema.commands)
      .values({
        commandId: args.commandId,
        matchId: args.matchId,
        requestJson: args.requestJson,
        outcome: 'rejected',
        rejectionJson: JSON.stringify(reason),
      })
      .run()
    return { _tag: 'rejected', reason }
  }

  commitAccepted(args: {
    match: ActiveMatchRecord
    commandId: CommandId
    requestJson: string
    command: MatchCommand
    entries: NonEmptyProtocolEntries
    finalState: MatchState | null
  }): { outcome: Extract<CommandReceiptOutcome, { _tag: 'accepted' }>; update: AcceptedCommandStreamUpdate } {
    const acceptedSeq = args.match.latestSeq + 1
    const acceptedAt = nowUnixEpochMilliseconds()
    const terminal = args.finalState !== null
    const finalState = terminal ? v.parse(MatchStateSchema, args.finalState) : null
    return this.db.transaction((tx) => {
      tx.insert(schema.commands)
        .values({
          commandId: args.commandId,
          matchId: args.match.matchId,
          requestJson: JSON.stringify(v.parse(MatchCommand, args.command)),
          outcome: 'accepted',
          acceptedSeq,
          acceptedAt,
          rejectionJson: null,
        })
        .run()
      args.entries.forEach((entry, entryIndex) =>
        tx
          .insert(schema.protocolEntries)
          .values({
            acceptedSeq,
            entryIndex,
            causedByCommandId: args.commandId,
            acceptedAt,
            frameIndex: entry.frameIndex ?? null,
            source: entry.source,
            entryType: entry.entryType,
            seat: entry.seat,
            scoreA: entry.scoreAfter?.A ?? null,
            scoreB: entry.scoreAfter?.B ?? null,
            bodyJson: JSON.stringify(entry.body),
          })
          .run(),
      )
      const result = tx
        .update(schema.activeMatches)
        .set({
          latestSeq: acceptedSeq,
          status: terminal ? 'finalizing' : 'active',
          finalStateJson: finalState ? JSON.stringify(finalState) : null,
          endedAt: terminal ? acceptedAt : null,
        })
        .where(
          and(eq(schema.activeMatches.matchId, args.match.matchId), eq(schema.activeMatches.latestSeq, args.match.latestSeq)),
        )
        .run()
      if (result.rowsWritten !== 1) throw new Error('Active match cursor mismatch')
      return {
        outcome: { _tag: 'accepted', acceptedSeq },
        update: { type: 'command-accepted', acceptedSeq, entries: [...args.entries], terminal },
      }
    })
  }
}

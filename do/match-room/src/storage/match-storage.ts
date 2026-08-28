import type { SparringMatchRejection } from '@ks/competition'
import {
  type AcceptedCommandHistoryEntry,
  type CommandId,
  MatchCommand,
  MatchConfig,
  MatchId,
  MatchState,
  type MatchStreamUpdate,
  type NonEmptyProtocolEntryContents,
  NonNegativeInteger,
  nowUnixEpochMilliseconds,
  ProtocolEntry,
  UnixEpochMilliseconds,
  UnknownObject,
} from '@ks/core'
import { RegisteredGameKeySchema } from '@ks/gameplay/definitions'
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import * as v from 'valibot'

import migrationsBundle from '../../drizzle/migrations.js'
import {
  type CommandReceiptOutcome,
  decodeStoredCommandOutcome,
  type StoredCommandOutcome,
} from './command-outcome'
import * as schema from './schema'

/**
 * Decodes the single persisted MatchRoom row and enforces its lifecycle invariants. Active rows have no terminal data;
 * finalizing rows carry a finished state for the same match and game, ready for transfer to D1.
 */
const ActiveMatchRecordSchema = v.pipe(
  v.object({
    matchId: MatchId,
    controlSecret: v.pipe(v.string(), v.minLength(16)),
    configJson: v.pipe(
      v.string(),
      v.parseJson(),
      v.intersect([MatchConfig, v.object({ gameKey: RegisteredGameKeySchema })]),
    ),
    latestSeq: NonNegativeInteger,
    status: v.picklist(['active', 'finalizing']),
    createdAt: UnixEpochMilliseconds,
    finalStateJson: v.nullable(v.pipe(v.string(), v.parseJson(), MatchState)),
    endedAt: v.nullable(UnixEpochMilliseconds),
  }),
  v.transform(({ configJson, finalStateJson, ...row }) => ({
    ...row,
    config: configJson,
    finalState: finalStateJson,
  })),
  v.check(
    (row) =>
      row.matchId === row.config.matchId &&
      (row.status === 'active'
        ? row.finalState === null && row.endedAt === null
        : row.finalState?.status === 'finished' && row.endedAt !== null) &&
      (row.finalState === null ||
        (row.finalState.matchId === row.matchId && row.finalState.gameKey === row.config.gameKey)),
  ),
)

export type ActiveMatchRecord = v.InferOutput<typeof ActiveMatchRecordSchema>
export type ActiveMatchInitialization = {
  readonly matchId: MatchId
  readonly controlSecret: string
  readonly configJson: string
  readonly createdAt: UnixEpochMilliseconds
}

const StoredProtocolEntryRow = v.pipe(
  v.object({
    ...v.omit(ProtocolEntry, ['body']).entries,
    bodyJson: v.pipe(v.string(), v.parseJson(), UnknownObject),
  }),
  v.transform(({ bodyJson, ...entry }) => ({ ...entry, body: bodyJson })),
)

function decodeEntry(row: typeof schema.protocolEntries.$inferSelect): ProtocolEntry {
  return v.parse(StoredProtocolEntryRow, {
    acceptedSeq: row.acceptedSeq,
    entryIndex: row.entryIndex,
    causedByCommandId: row.causedByCommandId,
    acceptedAt: row.acceptedAt,
    gameKey: row.gameKey,
    frameIndex: row.frameIndex,
    source: row.source,
    entryType: row.entryType,
    seat: row.seat,
    scoreAfter: row.scoreA === null || row.scoreB === null ? undefined : { A: row.scoreA, B: row.scoreB },
    bodyJson: row.bodyJson,
  })
}

export class MatchStorage {
  readonly #db

  constructor(storage: DurableObjectStorage) {
    this.#db = drizzle(storage)
  }

  migrate(): void {
    migrate(this.#db, migrationsBundle)
  }

  match(): ActiveMatchRecord | null {
    const row = this.#db.select().from(schema.activeMatches).limit(1).all()[0]
    if (!row) return null
    try {
      return v.parse(ActiveMatchRecordSchema, row)
    } catch {
      throw new Error('MatchRoom active_matches storage corruption')
    }
  }

  commandOutcome(commandId: CommandId): StoredCommandOutcome | null {
    const row = this.#db
      .select()
      .from(schema.commands)
      .where(eq(schema.commands.commandId, commandId))
      .limit(1)
      .all()[0]
    return row ? decodeStoredCommandOutcome(row, commandId) : null
  }

  protocolEntriesThrough(latestSeq: number): ProtocolEntry[] {
    try {
      return this.#db
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
    const commands = this.#db
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
              entry.entryIndex !== index ||
              entry.causedByCommandId !== row.commandId ||
              entry.acceptedAt !== row.acceptedAt,
          )
        )
          throw new Error('MatchRoom protocol_entries storage corruption')
        expected += 1
        const command = v.safeParse(v.pipe(v.string(), v.parseJson(), MatchCommand), row.requestJson)
        if (!command.success) throw new Error('MatchRoom commands storage corruption')
        return {
          command: command.output,
          protocolEntryContents: owned.map((entry) => {
            const {
              acceptedSeq: _acceptedSeq,
              entryIndex: _entryIndex,
              causedByCommandId: _commandId,
              acceptedAt: _acceptedAt,
              ...content
            } = entry
            return content
          }),
        }
      })
      .concat(
        expected - 1 === match.latestSeq
          ? []
          : (() => {
              throw new Error('Active match command tail sequence mismatch')
            })(),
      )
  }

  liveUpdatesAfter(since: number, through: number): MatchStreamUpdate[] {
    const updates: MatchStreamUpdate[] = []
    for (let seq = since + 1; seq <= through; seq += 1) {
      updates.push({ type: 'command-accepted', acceptedSeq: seq, terminal: false })
    }
    return updates
  }

  commitCreation(initialization: ActiveMatchInitialization): void {
    this.#db
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
    this.#db
      .insert(schema.commands)
      .values({
        commandId: args.commandId,
        matchId: args.matchId,
        requestJson: args.requestJson,
        outcome: 'rejected',
        rejectionJson: JSON.stringify(args.reason),
      })
      .run()
    return { _tag: 'rejected', reason: args.reason }
  }

  commitAccepted(args: {
    match: ActiveMatchRecord
    commandId: CommandId
    requestJson: string
    command: MatchCommand
    entryContents: NonEmptyProtocolEntryContents
    finalState: MatchState | null
  }): { outcome: Extract<CommandReceiptOutcome, { _tag: 'accepted' }>; update: MatchStreamUpdate } {
    const acceptedSeq = args.match.latestSeq + 1
    const acceptedAt = nowUnixEpochMilliseconds()
    const terminal = args.finalState !== null
    const finalState = args.finalState
    const entries = args.entryContents.map((content, entryIndex) =>
      v.parse(ProtocolEntry, {
        ...content,
        acceptedSeq,
        entryIndex,
        causedByCommandId: args.commandId,
        acceptedAt,
      }),
    )
    return this.#db.transaction((tx) => {
      tx.insert(schema.commands)
        .values({
          commandId: args.commandId,
          matchId: args.match.matchId,
          requestJson: JSON.stringify(args.command),
          outcome: 'accepted',
          acceptedSeq,
          acceptedAt,
          rejectionJson: null,
        })
        .run()
      entries.forEach((entry) =>
        tx
          .insert(schema.protocolEntries)
          .values({
            acceptedSeq: entry.acceptedSeq,
            entryIndex: entry.entryIndex,
            causedByCommandId: entry.causedByCommandId,
            acceptedAt: entry.acceptedAt,
            gameKey: entry.gameKey,
            frameIndex: entry.frameIndex,
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
          and(
            eq(schema.activeMatches.matchId, args.match.matchId),
            eq(schema.activeMatches.latestSeq, args.match.latestSeq),
          ),
        )
        .run()
      if (result.rowsWritten !== 1) throw new Error('Active match cursor mismatch')
      return {
        outcome: { _tag: 'accepted', acceptedSeq },
        update: { type: 'command-accepted', acceptedSeq, terminal },
      }
    })
  }
}

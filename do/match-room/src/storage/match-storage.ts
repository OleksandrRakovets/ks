import { type SparringMatchRejection, SparringMatchRejectionSchema } from '@ks/competition'
import {
  type AcceptedCommandHistoryEntry,
  MatchCommand,
  MatchConfig,
  MatchId,
  MatchState,
  type MatchStreamUpdate,
  type NonEmptyProtocolEntryContents,
  NonNegativeInteger,
  nowUnixEpochMilliseconds,
  PositiveInteger,
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
import * as schema from './schema'

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
      return v.parse(ActiveMatchRecord, row)
    } catch {
      throw new Error('MatchRoom active_matches storage corruption')
    }
  }

  findCommandReceipt(command: MatchCommand): CommandReceiptLookup | null {
    const row = this.#db
      .select()
      .from(schema.commands)
      .where(eq(schema.commands.commandId, command.commandId))
      .limit(1)
      .all()[0]
    if (!row) return null
    return jsonValuesEqual(decodeCommand(row), command)
      ? { _tag: 'retry', receipt: decodeCommandReceipt(row) }
      : { _tag: 'command-id-conflict' }
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
    const { config, ...values } = initialization
    this.#db
      .insert(schema.activeMatches)
      .values({
        ...values,
        matchId: config.matchId,
        configJson: JSON.stringify(config),
        latestSeq: 0,
        status: 'active',
        finalStateJson: null,
        endedAt: null,
      })
      .run()
  }

  commitRejectedCommand(args: {
    matchId: MatchId
    command: MatchCommand
    reason: SparringMatchRejection
  }): Extract<CommandReceipt, { _tag: 'rejected' }> {
    this.#db
      .insert(schema.commands)
      .values({
        commandId: args.command.commandId,
        matchId: args.matchId,
        requestJson: JSON.stringify(args.command),
        outcome: 'rejected',
        rejectionJson: JSON.stringify(args.reason),
      })
      .run()
    return { _tag: 'rejected', reason: args.reason }
  }

  commitAcceptedCommand(args: {
    match: ActiveMatchRecord
    command: MatchCommand
    entryContents: NonEmptyProtocolEntryContents
    finalState: MatchState | null
  }): { receipt: Extract<CommandReceipt, { _tag: 'accepted' }>; update: MatchStreamUpdate } {
    const acceptedSeq = args.match.latestSeq + 1
    const acceptedAt = nowUnixEpochMilliseconds()
    const terminal = args.finalState !== null
    const finalState = args.finalState
    const entries = args.entryContents.map((content, entryIndex) =>
      v.parse(ProtocolEntry, {
        ...content,
        acceptedSeq,
        entryIndex,
        causedByCommandId: args.command.commandId,
        acceptedAt,
      }),
    )
    return this.#db.transaction((tx) => {
      tx.insert(schema.commands)
        .values({
          commandId: args.command.commandId,
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
        receipt: { _tag: 'accepted', acceptedSeq },
        update: { type: 'command-accepted', acceptedSeq, terminal },
      }
    })
  }
}

const CommandReceipt = v.variant('_tag', [
  v.object({ _tag: v.literal('accepted'), acceptedSeq: PositiveInteger }),
  v.object({ _tag: v.literal('rejected'), reason: SparringMatchRejectionSchema }),
])

export type CommandReceipt = v.InferOutput<typeof CommandReceipt>
export type CommandReceiptLookup =
  | { readonly _tag: 'retry'; readonly receipt: CommandReceipt }
  | { readonly _tag: 'command-id-conflict' }

/**
 * Decodes the single persisted MatchRoom row and enforces its lifecycle invariants. Active rows have no terminal data;
 * finalizing rows carry a finished state for the same match and game, ready for transfer to D1.
 */
const ActiveMatchRecord = v.pipe(
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

export type ActiveMatchRecord = v.InferOutput<typeof ActiveMatchRecord>
export type ActiveMatchInitialization = {
  readonly config: MatchConfig
  readonly controlSecret: string
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

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    )
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  const leftEntries = Object.entries(left)
  const rightRecord = right as Record<string, unknown>
  return (
    leftEntries.length === Object.keys(rightRecord).length &&
    leftEntries.every(
      ([key, value]) => Object.hasOwn(rightRecord, key) && jsonValuesEqual(value, rightRecord[key]),
    )
  )
}

function decodeCommandReceipt(row: typeof schema.commands.$inferSelect): CommandReceipt {
  try {
    return v.parse(
      CommandReceipt,
      row.outcome === 'accepted'
        ? { _tag: 'accepted', acceptedSeq: row.acceptedSeq }
        : { _tag: 'rejected', reason: JSON.parse(row.rejectionJson ?? '') },
    )
  } catch {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`)
  }
}

function decodeCommand(row: typeof schema.commands.$inferSelect): MatchCommand {
  try {
    return v.parse(v.pipe(v.string(), v.parseJson(), MatchCommand), row.requestJson)
  } catch {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`)
  }
}

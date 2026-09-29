import { isDeepStrictEqual } from 'node:util'

import {
  isCorrectionCommand,
  type MatchCheckpoint,
  type MatchCorrectionTarget,
  type MatchRejection,
} from '@ks/competition'
import {
  AcceptedCommand,
  type MatchCommand,
  type MatchConfig,
  type MatchScoreProjection,
  type MatchState,
  type MatchStreamUpdate,
  PositiveInteger,
  projectMatchScore,
  ProtocolEntry,
  type ProtocolEntryContent,
  SystemClock,
  type UnixEpochMilliseconds,
} from '@ks/core'
import { and, asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import * as v from 'valibot'

import migrationsBundle from '../../drizzle/migrations.js'
import {
  type ActiveMatchRecord,
  checkpointFromRow,
  commandFromRow,
  type CommandReceipt,
  commandReceiptFromRow,
  type CommandReceiptLookup,
  type FinalizingMatchRecord,
  type MatchRecord,
  matchRecordFromRow,
  protocolEntryFromRow,
} from './records'
import * as schema from './schema'

export class MatchStorage {
  readonly #db
  readonly #clock = new SystemClock()
  #matchRecordLoaded = false
  #activeMatchRecord: ActiveMatchRecord | null = null
  #finalizingMatchRecord: FinalizingMatchRecord | null = null

  constructor(storage: DurableObjectStorage) {
    this.#db = drizzle(storage)
  }

  migrate(): void {
    migrate(this.#db, migrationsBundle)
  }

  commitCreation(initialization: MatchCreation): void {
    this.#db.transaction((tx) => {
      tx.insert(schema.activeMatches)
        .values({
          controlSecret: initialization.controlSecret,
          createdAt: initialization.createdAt,
          matchId: initialization.config.matchId,
          configJson: JSON.stringify(initialization.config),
          latestSeq: 0,
          scoreJson: JSON.stringify(initialization.score),
          status: 'active',
          endedAt: null,
        })
        .run()
      tx.insert(schema.checkpoints)
        .values({
          seq: 0,
          previousCheckpointSeq: null,
          aggregateJson: JSON.stringify(initialization.checkpoint),
          lastPlayerAcceptedSeq: null,
          lastPlayerEntryIndex: null,
        })
        .run()
    })

    const matchRecord = this.#readMatchRecord()

    if (!matchRecord) throw new Error('MatchRoom storage missing after creation')

    this.#cacheMatchRecord(matchRecord)
  }

  get optionalMatchRecord(): MatchRecord | null {
    this.#loadMatchRecord()

    return this.#activeMatchRecord ?? this.#finalizingMatchRecord
  }

  get anyMatchRecord(): MatchRecord {
    this.#loadMatchRecord()

    if (this.#activeMatchRecord) return this.#activeMatchRecord

    if (this.#finalizingMatchRecord) return this.#finalizingMatchRecord

    throw new Error('MatchRoom storage missing')
  }

  get activeMatchRecord(): ActiveMatchRecord {
    this.#loadMatchRecord()

    if (!this.#activeMatchRecord) throw new Error('Active Match record required')

    return this.#activeMatchRecord
  }

  get finalizingMatchRecord(): FinalizingMatchRecord {
    this.#loadMatchRecord()

    if (!this.#finalizingMatchRecord) throw new Error('Finalizing Match record required')

    return this.#finalizingMatchRecord
  }

  findCommandReceipt(command: MatchCommand): CommandReceiptLookup | null {
    const row = this.#db
      .select()
      .from(schema.commands)
      .where(eq(schema.commands.commandId, command.commandId))
      .get()

    if (!row) return null

    return isDeepStrictEqual(commandFromRow(row), command)
      ? { _tag: 'retry', receipt: commandReceiptFromRow(row) }
      : { _tag: 'command-id-conflict' }
  }

  commitRejectedCommand(args: {
    command: MatchCommand
    reason: MatchRejection
  }): Extract<CommandReceipt, { _tag: 'rejected' }> {
    this.#db
      .insert(schema.commands)
      .values({
        commandId: args.command.commandId,
        matchId: this.activeMatchRecord.matchId,
        requestJson: JSON.stringify(args.command),
        outcome: 'rejected',
        rejectionJson: JSON.stringify(args.reason),
      })
      .run()

    return { _tag: 'rejected', reason: args.reason }
  }

  commitAcceptedCommand(args: {
    command: MatchCommand
    checkpoint: MatchCheckpoint
    state: MatchState
    protocolEntryContents: readonly ProtocolEntryContent[]
  }): {
    receipt: Extract<CommandReceipt, { _tag: 'accepted' }>
    streamUpdate: MatchStreamUpdate
  } {
    return this.#commitAcceptedCommand(
      args,
      this.#selectCheckpointRow(this.activeMatchRecord.latestSeq),
      false,
    )
  }

  commitCorrection(args: {
    command: MatchCommand
    checkpoint: MatchCheckpoint
    state: MatchState
    protocolEntryContents: readonly ProtocolEntryContent[]
    target: StoredCorrectionTarget
  }): {
    receipt: Extract<CommandReceipt, { _tag: 'accepted' }>
    streamUpdate: MatchStreamUpdate
  } {
    return this.#commitAcceptedCommand(
      args,
      this.#selectCheckpointRow(args.target.previousCheckpointSeq),
      true,
    )
  }

  readCorrectionTarget(): StoredCorrectionTarget | null {
    const matchRecord = this.activeMatchRecord
    let targetRow = this.#selectCheckpointRow(matchRecord.latestSeq)

    if (targetRow.seq === 0) return null
    let targetCommand = commandFromRow(this.#selectAcceptedCommandRow(targetRow.seq))

    if (isCorrectionCommand(targetCommand)) {
      if (targetRow.previousCheckpointSeq === null)
        throw new Error('MatchRoom checkpoint predecessor corruption')
      targetRow = this.#selectEffectiveCheckpointRow(targetRow.previousCheckpointSeq)

      if (targetRow.seq === 0) return null
      targetCommand = commandFromRow(this.#selectAcceptedCommandRow(targetRow.seq))
    }

    if (targetRow.previousCheckpointSeq === null)
      throw new Error('MatchRoom checkpoint predecessor corruption')
    const previous = this.#selectEffectiveCheckpointRow(targetRow.previousCheckpointSeq)

    return {
      acceptedSeq: v.parse(PositiveInteger, targetRow.seq),
      command: targetCommand,
      protocolEntries: this.#readProtocolEntriesAt(targetRow.seq),
      previousCheckpointSeq: previous.seq,
      previousCheckpoint: checkpointFromRow(previous, matchRecord),
    }
  }

  #commitAcceptedCommand(
    args: AcceptedCommandCommit,
    previousCheckpoint: typeof schema.checkpoints.$inferSelect,
    inheritLastPlayer: boolean,
  ): {
    receipt: Extract<CommandReceipt, { _tag: 'accepted' }>
    streamUpdate: MatchStreamUpdate
  } {
    const matchRecord = this.activeMatchRecord

    const acceptedCommand = v.parse(AcceptedCommand, {
      ...args.command,
      acceptedSeq: matchRecord.latestSeq + 1,
      acceptedAt: this.#clock.nowMs(),
    })

    const endsMatch = args.state.status === 'finished'

    const entries = args.protocolEntryContents.map((content, entryIndex) =>
      v.parse(ProtocolEntry, {
        ...content,
        acceptedSeq: acceptedCommand.acceptedSeq,
        acceptedAt: acceptedCommand.acceptedAt,
        causedByCommandId: acceptedCommand.commandId,
        entryIndex,
      }),
    )

    if (entries.length === 0) throw new Error('Accepted Command must produce Protocol')

    const lastPlayer = entries
      .slice()
      .reverse()
      .find((entry) => entry.source === 'player')

    const score = projectMatchScore(args.state)

    const committed = this.#db.transaction((tx) => {
      tx.insert(schema.commands)
        .values({
          commandId: acceptedCommand.commandId,
          matchId: matchRecord.matchId,
          requestJson: JSON.stringify(args.command),
          outcome: 'accepted',
          acceptedSeq: acceptedCommand.acceptedSeq,
          acceptedAt: acceptedCommand.acceptedAt,
          rejectionJson: null,
        })
        .run()

      tx.insert(schema.checkpoints)
        .values({
          seq: acceptedCommand.acceptedSeq,
          previousCheckpointSeq: previousCheckpoint.seq,
          aggregateJson: JSON.stringify(args.checkpoint),
          lastPlayerAcceptedSeq: inheritLastPlayer
            ? previousCheckpoint.lastPlayerAcceptedSeq
            : (lastPlayer?.acceptedSeq ?? previousCheckpoint.lastPlayerAcceptedSeq),
          lastPlayerEntryIndex: inheritLastPlayer
            ? previousCheckpoint.lastPlayerEntryIndex
            : (lastPlayer?.entryIndex ?? previousCheckpoint.lastPlayerEntryIndex),
        })
        .run()

      for (const entry of entries)
        tx.insert(schema.protocolEntries)
          .values({
            acceptedSeq: entry.acceptedSeq,
            entryIndex: entry.entryIndex,
            entryJson: JSON.stringify(entry),
          })
          .run()

      const result = tx
        .update(schema.activeMatches)
        .set({
          latestSeq: acceptedCommand.acceptedSeq,
          scoreJson: JSON.stringify(score),
          status: endsMatch ? 'finalizing' : 'active',
          endedAt: endsMatch ? acceptedCommand.acceptedAt : null,
        })
        .where(
          and(
            eq(schema.activeMatches.matchId, matchRecord.matchId),
            eq(schema.activeMatches.latestSeq, matchRecord.latestSeq),
            eq(schema.activeMatches.status, 'active'),
          ),
        )
        .run()

      if (result.rowsWritten !== 1) throw new Error('Active match cursor mismatch')

      return {
        receipt: { _tag: 'accepted', acceptedSeq: acceptedCommand.acceptedSeq },
        streamUpdate: {
          type: 'command-accepted',
          acceptedSeq: acceptedCommand.acceptedSeq,
          endsMatch,
        },
      } satisfies {
        receipt: Extract<CommandReceipt, { _tag: 'accepted' }>
        streamUpdate: MatchStreamUpdate
      }
    })

    this.#cacheMatchRecord(
      endsMatch
        ? {
            ...matchRecord,
            latestSeq: acceptedCommand.acceptedSeq,
            score,
            status: 'finalizing',
            endedAt: acceptedCommand.acceptedAt,
          }
        : { ...matchRecord, latestSeq: acceptedCommand.acceptedSeq, score },
    )

    return committed
  }

  readCurrentCheckpoint(): MatchCheckpoint {
    const matchRecord = this.anyMatchRecord

    return checkpointFromRow(this.#selectCheckpointRow(matchRecord.latestSeq), matchRecord)
  }

  readLastCommand(): { readonly command: MatchCommand; readonly entry: ProtocolEntry } | null {
    const row = this.#selectCheckpointRow(this.activeMatchRecord.latestSeq)

    if (row.lastPlayerAcceptedSeq === null || row.lastPlayerEntryIndex === null) return null

    const entry = this.#db
      .select()
      .from(schema.protocolEntries)
      .where(
        and(
          eq(schema.protocolEntries.acceptedSeq, row.lastPlayerAcceptedSeq),
          eq(schema.protocolEntries.entryIndex, row.lastPlayerEntryIndex),
        ),
      )
      .get()

    if (!entry) throw new Error('MatchRoom checkpoint player reference corruption')

    return {
      command: commandFromRow(this.#selectAcceptedCommandRow(row.lastPlayerAcceptedSeq)),
      entry: protocolEntryFromRow(entry),
    }
  }

  readProtocol(): ProtocolEntry[] {
    const matchRecord = this.anyMatchRecord

    const rows = this.#db
      .select()
      .from(schema.protocolEntries)
      .orderBy(asc(schema.protocolEntries.acceptedSeq), asc(schema.protocolEntries.entryIndex))
      .all()

    const entries = rows.map((row) => protocolEntryFromRow(row))
    let seq = 0
    let index = 0

    for (const entry of entries) {
      if (entry.acceptedSeq === seq + 1) {
        seq++
        index = 0
      }

      if (
        entry.acceptedSeq !== seq ||
        entry.entryIndex !== index++ ||
        entry.gameKey !== matchRecord.config.gameKey
      )
        throw new Error('MatchRoom Protocol storage corruption')
    }

    if (seq !== matchRecord.latestSeq) throw new Error('MatchRoom Protocol cursor mismatch')

    return entries
  }

  #readProtocolEntriesAt(seq: number): ProtocolEntry[] {
    return this.#db
      .select()
      .from(schema.protocolEntries)
      .where(eq(schema.protocolEntries.acceptedSeq, seq))
      .orderBy(asc(schema.protocolEntries.entryIndex))
      .all()
      .map((row) => protocolEntryFromRow(row))
  }

  #selectEffectiveCheckpointRow(seq: number): typeof schema.checkpoints.$inferSelect {
    let row = this.#selectCheckpointRow(seq)

    while (row.seq > 0) {
      const command = commandFromRow(this.#selectAcceptedCommandRow(row.seq))

      if (!isCorrectionCommand(command)) return row

      if (row.previousCheckpointSeq === null) throw new Error('MatchRoom checkpoint predecessor corruption')
      row = this.#selectCheckpointRow(row.previousCheckpointSeq)
    }

    return row
  }

  #selectAcceptedCommandRow(seq: number): typeof schema.commands.$inferSelect {
    const row = this.#db.select().from(schema.commands).where(eq(schema.commands.acceptedSeq, seq)).get()

    if (row?.outcome !== 'accepted') throw new Error('MatchRoom accepted Command storage corruption')

    return row
  }

  #readMatchRecord(): MatchRecord | null {
    const rows = this.#db.select().from(schema.activeMatches).limit(2).all()

    if (rows.length > 1) throw new Error('MatchRoom contains multiple Match rows')

    if (!rows[0]) return null

    return matchRecordFromRow(rows[0])
  }

  #loadMatchRecord(): void {
    if (this.#matchRecordLoaded) return

    this.#cacheMatchRecord(this.#readMatchRecord())
  }

  #cacheMatchRecord(matchRecord: MatchRecord | null): void {
    this.#activeMatchRecord = matchRecord?.status === 'active' ? matchRecord : null
    this.#finalizingMatchRecord = matchRecord?.status === 'finalizing' ? matchRecord : null
    this.#matchRecordLoaded = true
  }

  #selectCheckpointRow(seq: number): typeof schema.checkpoints.$inferSelect {
    const row = this.#db.select().from(schema.checkpoints).where(eq(schema.checkpoints.seq, seq)).get()

    if (!row) throw new Error('MatchRoom checkpoint storage corruption')

    return row
  }
}

export type MatchCreation = {
  readonly config: MatchConfig
  readonly controlSecret: string
  readonly createdAt: UnixEpochMilliseconds
  readonly checkpoint: MatchCheckpoint
  readonly score: MatchScoreProjection
}

type AcceptedCommandCommit = {
  readonly command: MatchCommand
  readonly checkpoint: MatchCheckpoint
  readonly state: MatchState
  readonly protocolEntryContents: readonly ProtocolEntryContent[]
}

export type StoredCorrectionTarget = MatchCorrectionTarget & {
  readonly previousCheckpointSeq: number
  readonly previousCheckpoint: MatchCheckpoint
}

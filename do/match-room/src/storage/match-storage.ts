import { isDeepStrictEqual } from 'node:util'

import type { MatchCheckpoint, MatchRejection, MatchRoomPresentation } from '@ks/competition'
import {
  AcceptedCommand,
  type MatchCommand,
  type MatchConfig,
  type MatchId,
  type MatchStreamUpdate,
  projectMatchScore,
  ProtocolEntry,
  type ProtocolEntryContent,
  SystemClock,
  type UnixEpochMilliseconds,
} from '@ks/core'
import type { GameResult as GameResultValue } from '@ks/gameplay/definitions'
import { and, asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import * as v from 'valibot'

import migrationsBundle from '../../drizzle/migrations.js'
import {
  type CommandReceipt,
  type CommandReceiptLookup,
  decodeCheckpoint,
  decodeCommand,
  decodeCommandReceipt,
  decodePresentation,
  decodeProtocolEntry,
  decodeState,
  decodeStoredMatch,
  type StoredActiveMatch,
  type StoredMatch,
} from './definitions'
import * as schema from './schema'

export class MatchStorage {
  readonly #db
  readonly #clock = new SystemClock()

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
          currentCheckpointSeq: 0,
          scoreJson: JSON.stringify(projectMatchScore(initialization.presentation.state)),
          status: 'active',
          finalStateJson: null,
          gameResultJson: null,
          endedAt: null,
        })
        .run()
      tx.insert(schema.checkpoints)
        .values({
          seq: 0,
          previousCheckpointSeq: null,
          aggregateJson: JSON.stringify(initialization.checkpoint),
          stateJson: JSON.stringify(initialization.presentation.state),
          gamePresentationJson:
            initialization.presentation.game === undefined
              ? null
              : JSON.stringify(initialization.presentation.game),
          lastPlayerAcceptedSeq: null,
          lastPlayerEntryIndex: null,
        })
        .run()
    })
  }

  match(): StoredMatch | null {
    const rows = this.#db.select().from(schema.activeMatches).limit(2).all()

    if (rows.length > 1) throw new Error('MatchRoom contains multiple Match rows')

    if (!rows[0]) return null

    return decodeStoredMatch(rows[0])
  }

  findCommandReceipt(command: MatchCommand): CommandReceiptLookup | null {
    const row = this.#db
      .select()
      .from(schema.commands)
      .where(eq(schema.commands.commandId, command.commandId))
      .limit(1)
      .all()[0]

    if (!row) return null

    return isDeepStrictEqual(decodeCommand(row), command)
      ? { _tag: 'retry', receipt: decodeCommandReceipt(row) }
      : { _tag: 'command-id-conflict' }
  }

  commitRejectedCommand(args: {
    matchId: MatchId
    command: MatchCommand
    reason: MatchRejection
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
    match: StoredActiveMatch
    command: MatchCommand
    checkpoint: MatchCheckpoint
    presentation: MatchRoomPresentation
    protocolEntryContents: readonly ProtocolEntryContent[]
    gameResult: GameResultValue | null
  }): {
    receipt: Extract<CommandReceipt, { _tag: 'accepted' }>
    streamUpdate: MatchStreamUpdate
  } {
    const acceptedCommand = v.parse(AcceptedCommand, {
      ...args.command,
      acceptedSeq: args.match.latestSeq + 1,
      acceptedAt: this.#clock.nowMs(),
    })

    const endsMatch = args.presentation.state.status === 'finished'

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

    const prior = this.#checkpointRow(args.match.currentCheckpointSeq)
    const score = projectMatchScore(args.presentation.state)

    return this.#db.transaction((tx) => {
      tx.insert(schema.commands)
        .values({
          commandId: acceptedCommand.commandId,
          matchId: args.match.matchId,
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
          previousCheckpointSeq: args.match.currentCheckpointSeq,
          aggregateJson: JSON.stringify(args.checkpoint),
          stateJson: JSON.stringify(args.presentation.state),
          gamePresentationJson:
            args.presentation.game === undefined ? null : JSON.stringify(args.presentation.game),
          lastPlayerAcceptedSeq: lastPlayer?.acceptedSeq ?? prior.lastPlayerAcceptedSeq,
          lastPlayerEntryIndex: lastPlayer?.entryIndex ?? prior.lastPlayerEntryIndex,
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
          currentCheckpointSeq: acceptedCommand.acceptedSeq,
          scoreJson: JSON.stringify(score),
          status: endsMatch ? 'finalizing' : 'active',
          finalStateJson: endsMatch ? JSON.stringify(args.presentation.state) : null,
          gameResultJson: endsMatch && args.gameResult ? JSON.stringify(args.gameResult) : null,
          endedAt: endsMatch ? acceptedCommand.acceptedAt : null,
        })
        .where(
          and(
            eq(schema.activeMatches.matchId, args.match.matchId),
            eq(schema.activeMatches.latestSeq, args.match.latestSeq),
            eq(schema.activeMatches.currentCheckpointSeq, args.match.currentCheckpointSeq),
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
      }
    })
  }

  /** Only executable reads decode the aggregate blob. The caller restores and checks its projection. */
  readCurrentCheckpoint(storedMatch: StoredActiveMatch) {
    const row = this.#checkpointRow(storedMatch.currentCheckpointSeq)

    return {
      checkpoint: decodeCheckpoint(row.aggregateJson, storedMatch),
      state: decodeState(row.stateJson, storedMatch),
    }
  }

  readCurrentState(storedMatch: StoredMatch) {
    return decodeState(this.#checkpointRow(storedMatch.currentCheckpointSeq).stateJson, storedMatch)
  }

  readCurrentPresentation(storedMatch: StoredActiveMatch): MatchRoomPresentation {
    const row = this.#checkpointRow(storedMatch.currentCheckpointSeq)

    return decodePresentation(row.stateJson, row.gamePresentationJson, storedMatch)
  }

  readLastPlayerEntry(storedMatch: StoredActiveMatch): ProtocolEntry | null {
    const row = this.#checkpointRow(storedMatch.currentCheckpointSeq)

    if (row.lastPlayerAcceptedSeq === null && row.lastPlayerEntryIndex === null) return null

    if (row.lastPlayerAcceptedSeq === null || row.lastPlayerEntryIndex === null)
      throw new Error('MatchRoom checkpoint player reference corruption')

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
    const parsed = decodeProtocolEntry(entry)

    if (
      parsed.source !== 'player' ||
      parsed.acceptedSeq > storedMatch.currentCheckpointSeq ||
      parsed.gameKey !== storedMatch.config.gameKey
    )
      throw new Error('MatchRoom checkpoint player reference corruption')

    return parsed
  }

  readProtocol(storedMatch: StoredMatch): ProtocolEntry[] {
    const rows = this.#db
      .select()
      .from(schema.protocolEntries)
      .orderBy(asc(schema.protocolEntries.acceptedSeq), asc(schema.protocolEntries.entryIndex))
      .all()

    const entries = rows.map((row) => decodeProtocolEntry(row))
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
        entry.gameKey !== storedMatch.config.gameKey
      )
        throw new Error('MatchRoom Protocol storage corruption')
    }

    if (seq !== storedMatch.latestSeq) throw new Error('MatchRoom Protocol cursor mismatch')

    return entries
  }

  #checkpointRow(seq: number): typeof schema.checkpoints.$inferSelect {
    const row = this.#db.select().from(schema.checkpoints).where(eq(schema.checkpoints.seq, seq)).get()

    if (
      !row ||
      (seq === 0
        ? row.previousCheckpointSeq !== null
        : row.previousCheckpointSeq === null ||
          row.previousCheckpointSeq < 0 ||
          row.previousCheckpointSeq >= seq) ||
      (row.lastPlayerAcceptedSeq === null) !== (row.lastPlayerEntryIndex === null)
    )
      throw new Error('MatchRoom checkpoint storage corruption')

    return row
  }
}

export type MatchCreation = {
  readonly config: MatchConfig
  readonly controlSecret: string
  readonly createdAt: UnixEpochMilliseconds
  readonly checkpoint: MatchCheckpoint
  readonly presentation: MatchRoomPresentation
}

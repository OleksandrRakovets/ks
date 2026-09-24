import { isDeepStrictEqual } from 'node:util'

import { SparringMatchRejection } from '@ks/competition'
import {
  AcceptedCommand,
  MatchCommand,
  MatchConfig,
  MatchId,
  MatchState,
  type MatchStreamUpdate,
  NonNegativeInteger,
  nowUnixEpochMilliseconds,
  PositiveInteger,
  UnixEpochMilliseconds,
} from '@ks/core'
import { RegisteredGameKey } from '@ks/gameplay/definitions'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
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

  commitCreation(initialization: MatchCreation): void {
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

  match(): StoredMatch | null {
    const rows = this.#db.select().from(schema.activeMatches).limit(2).all()

    if (rows.length > 1) throw new Error('MatchRoom contains multiple Match rows')

    if (!rows[0]) return null

    try {
      return v.parse(StoredMatch, rows[0])
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

    return isDeepStrictEqual(decodeCommand(row), command)
      ? { _tag: 'retry', receipt: decodeCommandReceipt(row) }
      : { _tag: 'command-id-conflict' }
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
    match: StoredActiveMatch
    command: MatchCommand
    finalState: MatchState | null
  }): {
    acceptedCommand: AcceptedCommand
    receipt: Extract<CommandReceipt, { _tag: 'accepted' }>
    streamUpdate: MatchStreamUpdate
    storedMatch: StoredMatch
  } {
    const acceptedCommand = v.parse(AcceptedCommand, {
      ...args.command,
      acceptedSeq: args.match.latestSeq + 1,
      acceptedAt: nowUnixEpochMilliseconds(),
    })

    const endsMatch = args.finalState !== null

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

      const result = tx
        .update(schema.activeMatches)
        .set({
          latestSeq: acceptedCommand.acceptedSeq,
          status: endsMatch ? 'finalizing' : 'active',
          finalStateJson: args.finalState ? JSON.stringify(args.finalState) : null,
          endedAt: endsMatch ? acceptedCommand.acceptedAt : null,
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
        acceptedCommand,
        receipt: { _tag: 'accepted', acceptedSeq: acceptedCommand.acceptedSeq },
        streamUpdate: {
          type: 'command-accepted',
          acceptedSeq: acceptedCommand.acceptedSeq,
          endsMatch,
        },
        storedMatch:
          args.finalState === null
            ? { ...args.match, latestSeq: acceptedCommand.acceptedSeq }
            : {
                ...args.match,
                latestSeq: acceptedCommand.acceptedSeq,
                status: 'finalizing',
                finalState: args.finalState,
                endedAt: acceptedCommand.acceptedAt,
              },
      }
    })
  }

  readAcceptedCommands(match: StoredMatch): AcceptedCommand[] {
    try {
      const rows = this.#db
        .select()
        .from(schema.commands)
        .where(isNotNull(schema.commands.acceptedSeq))
        .orderBy(asc(schema.commands.acceptedSeq))
        .all()

      const commands = rows.map((row, index) => {
        if (
          row.matchId !== match.matchId ||
          row.outcome !== 'accepted' ||
          row.rejectionJson !== null ||
          row.acceptedSeq !== index + 1 ||
          row.acceptedAt === null
        )
          throw new Error('invalid accepted row')
        const command = decodeCommand(row)

        if (command.commandId !== row.commandId) throw new Error('command ID mismatch')

        return v.parse(AcceptedCommand, {
          ...command,
          acceptedSeq: row.acceptedSeq,
          acceptedAt: row.acceptedAt,
        })
      })

      if (commands.length !== match.latestSeq) throw new Error('tail mismatch')

      return commands
    } catch {
      throw new Error('MatchRoom commands storage corruption')
    }
  }
}

const CommandReceipt = v.variant('_tag', [
  v.pipe(v.object({ _tag: v.literal('accepted'), acceptedSeq: PositiveInteger }), v.readonly()),
  v.pipe(v.object({ _tag: v.literal('rejected'), reason: SparringMatchRejection }), v.readonly()),
])

export type CommandReceipt = v.InferOutput<typeof CommandReceipt>

export type CommandReceiptLookup =
  | { readonly _tag: 'retry'; readonly receipt: CommandReceipt }
  | { readonly _tag: 'command-id-conflict' }

const ActiveMatchConfig = v.pipe(
  v.object({ ...MatchConfig.entries, gameKey: RegisteredGameKey }),
  v.readonly(),
)

const StoredMatchFields = {
  matchId: MatchId,
  controlSecret: v.pipe(v.string(), v.minLength(16)),
  configJson: v.pipe(v.string(), v.parseJson(), ActiveMatchConfig),
  latestSeq: NonNegativeInteger,
  createdAt: UnixEpochMilliseconds,
}

const StoredActiveMatch = v.pipe(
  v.object({
    ...StoredMatchFields,
    status: v.literal('active'),
    finalStateJson: v.null(),
    endedAt: v.null(),
  }),
  v.transform(({ configJson, finalStateJson, ...row }) => ({
    ...row,
    config: configJson,
    finalState: finalStateJson,
  })),
  v.check((row) => row.matchId === row.config.matchId),
  v.readonly(),
)

const StoredFinalizingMatch = v.pipe(
  v.object({
    ...StoredMatchFields,
    status: v.literal('finalizing'),
    finalStateJson: v.pipe(v.string(), v.parseJson(), MatchState),
    endedAt: UnixEpochMilliseconds,
  }),
  v.transform(({ configJson, finalStateJson, ...row }) => ({
    ...row,
    config: configJson,
    finalState: finalStateJson,
  })),
  v.check(
    (row) =>
      row.matchId === row.config.matchId &&
      row.finalState.status === 'finished' &&
      row.finalState.matchId === row.matchId &&
      row.finalState.gameKey === row.config.gameKey &&
      isDeepStrictEqual(row.finalState.targets, row.config.targets),
  ),
  v.readonly(),
)

const StoredMatch = v.variant('status', [StoredActiveMatch, StoredFinalizingMatch])

export type StoredActiveMatch = v.InferOutput<typeof StoredActiveMatch>

export type StoredFinalizingMatch = v.InferOutput<typeof StoredFinalizingMatch>

export type StoredMatch = v.InferOutput<typeof StoredMatch>

export type MatchCreation = {
  readonly config: MatchConfig
  readonly controlSecret: string
  readonly createdAt: UnixEpochMilliseconds
}

function decodeCommand(row: typeof schema.commands.$inferSelect): MatchCommand {
  try {
    return v.parse(v.pipe(v.string(), v.parseJson(), MatchCommand), row.requestJson)
  } catch {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`)
  }
}

function decodeCommandReceipt(row: typeof schema.commands.$inferSelect): CommandReceipt {
  try {
    if (row.outcome === 'accepted')
      return v.parse(CommandReceipt, { _tag: 'accepted', acceptedSeq: row.acceptedSeq })
    const rejectionReason: unknown = JSON.parse(row.rejectionJson ?? '')

    return v.parse(CommandReceipt, { _tag: 'rejected', reason: rejectionReason })
  } catch {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`)
  }
}

import { isDeepStrictEqual } from 'node:util'

import { MatchCheckpoint, MatchRejection, type MatchRoomProjection } from '@ks/competition'
import {
  AcceptedCommand,
  Control,
  MatchCommand,
  MatchConfig,
  MatchId,
  MatchScoreProjection,
  MatchState,
  type MatchStreamUpdate,
  NonNegativeInteger,
  PositiveInteger,
  projectMatchScore,
  ProtocolEntry,
  type ProtocolEntryContent,
  SystemClock,
  UnixEpochMilliseconds,
} from '@ks/core'
import {
  GameResult,
  type GameResult as GameResultValue,
  RegisteredGameKey,
  registry,
} from '@ks/gameplay/definitions'
import { and, asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import * as v from 'valibot'

import migrationsBundle from '../../drizzle/migrations.js'
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
          scoreJson: JSON.stringify(projectMatchScore(initialization.projection.state)),
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
          stateJson: JSON.stringify(initialization.projection.state),
          projectionJson: JSON.stringify(initialization.projection),
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
    projection: MatchRoomProjection
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

    const endsMatch = args.projection.state.status === 'finished'

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
    const score = projectMatchScore(args.projection.state)

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
          stateJson: JSON.stringify(args.projection.state),
          projectionJson: JSON.stringify(args.projection),
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
          finalStateJson: endsMatch ? JSON.stringify(args.projection.state) : null,
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
  readCurrentCheckpoint(header: StoredActiveMatch) {
    try {
      const row = this.#checkpointRow(header.currentCheckpointSeq)
      const checkpoint = v.parse(v.pipe(v.string(), v.parseJson(), MatchCheckpoint), row.aggregateJson)

      if (!isDeepStrictEqual(checkpoint.lifecycle.context.config, header.config))
        throw new Error('config mismatch')

      return { checkpoint, state: this.#decodeState(row.stateJson, header) }
    } catch {
      throw new Error('MatchRoom checkpoint storage corruption')
    }
  }

  readCurrentState(header: StoredMatch): MatchState {
    return this.#decodeState(this.#checkpointRow(header.currentCheckpointSeq).stateJson, header)
  }

  readCurrentProjection(header: StoredActiveMatch): MatchRoomProjection {
    const row = this.#checkpointRow(header.currentCheckpointSeq)

    try {
      const projection = v.parse(
        v.pipe(
          v.string(),
          v.parseJson(),
          v.object({
            state: MatchState,
            game: v.optional(v.unknown()),
            controls: v.array(Control),
          }),
        ),
        row.projectionJson,
      )

      if (!isDeepStrictEqual(projection.state, this.#decodeState(row.stateJson, header)))
        throw new Error('state mismatch')

      if (
        projection.game !== undefined &&
        !v.is(registry[header.config.gameKey].presentationSchema, projection.game)
      )
        throw new Error('game mismatch')

      // SAFETY: the state is validated against the current registered key and the optional game
      // presentation against that key's schema; Control is validated above.
      return projection as MatchRoomProjection
    } catch {
      throw new Error('MatchRoom checkpoint projection storage corruption')
    }
  }

  readLastPlayerEntry(header: StoredActiveMatch): ProtocolEntry | null {
    const row = this.#checkpointRow(header.currentCheckpointSeq)

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
    const parsed = this.#decodeEntry(entry)

    if (
      parsed.source !== 'player' ||
      parsed.acceptedSeq > header.currentCheckpointSeq ||
      parsed.gameKey !== header.config.gameKey
    )
      throw new Error('MatchRoom checkpoint player reference corruption')

    return parsed
  }

  readProtocol(header: StoredMatch): ProtocolEntry[] {
    const rows = this.#db
      .select()
      .from(schema.protocolEntries)
      .orderBy(asc(schema.protocolEntries.acceptedSeq), asc(schema.protocolEntries.entryIndex))
      .all()

    const entries = rows.map((row) => this.#decodeEntry(row))
    let seq = 0
    let index = 0

    for (const entry of entries) {
      if (entry.acceptedSeq === seq + 1) {
        seq++
        index = 0
      }

      if (entry.acceptedSeq !== seq || entry.entryIndex !== index++ || entry.gameKey !== header.config.gameKey)
        throw new Error('MatchRoom Protocol storage corruption')
    }

    if (seq !== header.latestSeq) throw new Error('MatchRoom Protocol cursor mismatch')

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

  #decodeState(json: string, header: StoredMatch): MatchState {
    try {
      const state = v.parse(v.pipe(v.string(), v.parseJson(), MatchState), json)

      if (
        state.matchId !== header.matchId ||
        state.gameKey !== header.config.gameKey ||
        !isDeepStrictEqual(state.targets, header.config.targets) ||
        state.status !== (header.status === 'active' ? 'active' : 'finished') ||
        !isDeepStrictEqual(projectMatchScore(state), header.score)
      )
        throw new Error('state mismatch')

      return state
    } catch {
      throw new Error('MatchRoom checkpoint state storage corruption')
    }
  }

  #decodeEntry(row: typeof schema.protocolEntries.$inferSelect): ProtocolEntry {
    try {
      const entry = v.parse(v.pipe(v.string(), v.parseJson(), ProtocolEntry), row.entryJson)

      if (entry.acceptedSeq !== row.acceptedSeq || entry.entryIndex !== row.entryIndex)
        throw new Error('position mismatch')

      return entry
    } catch {
      throw new Error('MatchRoom Protocol storage corruption')
    }
  }
}

const CommandReceipt = v.variant('_tag', [
  v.pipe(v.object({ _tag: v.literal('accepted'), acceptedSeq: PositiveInteger }), v.readonly()),
  v.pipe(v.object({ _tag: v.literal('rejected'), reason: MatchRejection }), v.readonly()),
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
  currentCheckpointSeq: NonNegativeInteger,
  scoreJson: v.pipe(v.string(), v.parseJson(), MatchScoreProjection),
  createdAt: UnixEpochMilliseconds,
  gameResultJson: v.nullable(v.pipe(v.string(), v.parseJson(), GameResult)),
}

const StoredActiveMatch = v.pipe(
  v.object({
    ...StoredMatchFields,
    status: v.literal('active'),
    finalStateJson: v.null(),
    gameResultJson: v.null(),
    endedAt: v.null(),
  }),
  v.transform(({ configJson, finalStateJson, gameResultJson, scoreJson, ...row }) => ({
    ...row,
    config: configJson,
    finalState: finalStateJson,
    gameResult: gameResultJson,
    score: scoreJson,
  })),
  v.check((row) => row.matchId === row.config.matchId && row.currentCheckpointSeq <= row.latestSeq),
  v.readonly(),
)

const StoredFinalizingMatch = v.pipe(
  v.object({
    ...StoredMatchFields,
    status: v.literal('finalizing'),
    finalStateJson: v.pipe(v.string(), v.parseJson(), MatchState),
    endedAt: UnixEpochMilliseconds,
  }),
  v.transform(({ configJson, finalStateJson, gameResultJson, scoreJson, ...row }) => ({
    ...row,
    config: configJson,
    finalState: finalStateJson,
    gameResult: gameResultJson,
    score: scoreJson,
  })),
  v.check(
    (row) =>
      row.matchId === row.config.matchId &&
      row.currentCheckpointSeq <= row.latestSeq &&
      row.finalState.status === 'finished' &&
      row.finalState.matchId === row.matchId &&
      row.finalState.gameKey === row.config.gameKey &&
      isDeepStrictEqual(row.finalState.targets, row.config.targets) &&
      isDeepStrictEqual(row.score, projectMatchScore(row.finalState)) &&
      (row.config.gameKey === 'free-pyramid-long'
        ? row.gameResult?.gameKey === row.config.gameKey
        : row.gameResult === null),
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
  readonly checkpoint: MatchCheckpoint
  readonly projection: MatchRoomProjection
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

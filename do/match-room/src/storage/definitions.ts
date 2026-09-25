import { isDeepStrictEqual } from 'node:util'

import { MatchCheckpoint, MatchRejection, type MatchRoomPresentation } from '@ks/competition'
import {
  MatchCommand,
  MatchConfig,
  MatchId,
  MatchScoreProjection,
  MatchState,
  NonNegativeInteger,
  PositiveInteger,
  projectMatchScore,
  ProtocolEntry,
  UnixEpochMilliseconds,
} from '@ks/core'
import { GameResult, RegisteredGameKey, registry } from '@ks/gameplay/definitions'
import * as v from 'valibot'

import * as schema from './schema'

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

export function decodeStoredMatch(row: typeof schema.activeMatches.$inferSelect): StoredMatch {
  try {
    return v.parse(StoredMatch, row)
  } catch (cause) {
    throw new Error('MatchRoom active_matches storage corruption', { cause })
  }
}

export function decodeCommand(row: typeof schema.commands.$inferSelect): MatchCommand {
  try {
    return v.parse(v.pipe(v.string(), v.parseJson(), MatchCommand), row.requestJson)
  } catch (cause) {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`, { cause })
  }
}

export function decodeCommandReceipt(row: typeof schema.commands.$inferSelect): CommandReceipt {
  try {
    if (row.outcome === 'accepted')
      return v.parse(CommandReceipt, { _tag: 'accepted', acceptedSeq: row.acceptedSeq })
    const rejectionReason: unknown = JSON.parse(row.rejectionJson ?? '')

    return v.parse(CommandReceipt, { _tag: 'rejected', reason: rejectionReason })
  } catch (cause) {
    throw new Error(`MatchRoom commands storage corruption for command ${row.commandId}`, { cause })
  }
}

export function decodeCheckpoint(json: string, storedMatch: StoredActiveMatch): MatchCheckpoint {
  try {
    const checkpoint = v.parse(v.pipe(v.string(), v.parseJson(), MatchCheckpoint), json)

    if (!isDeepStrictEqual(checkpoint.lifecycle.context.config, storedMatch.config))
      throw new Error('config mismatch')

    return checkpoint
  } catch (cause) {
    throw new Error('MatchRoom checkpoint storage corruption', { cause })
  }
}

export function decodeState(json: string, storedMatch: StoredMatch): MatchState {
  try {
    const state = v.parse(v.pipe(v.string(), v.parseJson(), MatchState), json)

    if (
      state.matchId !== storedMatch.matchId ||
      state.gameKey !== storedMatch.config.gameKey ||
      !isDeepStrictEqual(state.targets, storedMatch.config.targets) ||
      state.status !== (storedMatch.status === 'active' ? 'active' : 'finished') ||
      !isDeepStrictEqual(projectMatchScore(state), storedMatch.score)
    )
      throw new Error('state mismatch')

    return state
  } catch (cause) {
    throw new Error('MatchRoom checkpoint state storage corruption', { cause })
  }
}

export function decodePresentation(
  stateJson: string,
  gamePresentationJson: string | null,
  storedMatch: StoredActiveMatch,
): MatchRoomPresentation {
  const state = decodeState(stateJson, storedMatch)

  try {
    const game =
      gamePresentationJson === null
        ? undefined
        : v.parse(
            v.pipe(v.string(), v.parseJson(), registry[storedMatch.config.gameKey].presentationSchema),
            gamePresentationJson,
          )

    // SAFETY: state and game presentation are validated against the same registered game key.
    return { state, game } as MatchRoomPresentation
  } catch (cause) {
    throw new Error('MatchRoom checkpoint presentation storage corruption', { cause })
  }
}

export function decodeProtocolEntry(row: typeof schema.protocolEntries.$inferSelect): ProtocolEntry {
  try {
    const entry = v.parse(v.pipe(v.string(), v.parseJson(), ProtocolEntry), row.entryJson)

    if (entry.acceptedSeq !== row.acceptedSeq || entry.entryIndex !== row.entryIndex)
      throw new Error('position mismatch')

    return entry
  } catch (cause) {
    throw new Error('MatchRoom Protocol storage corruption', { cause })
  }
}

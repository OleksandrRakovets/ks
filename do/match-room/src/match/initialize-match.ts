import { isDeepStrictEqual } from 'node:util'

import { buildMatchConfig, createMatch, type CreateMatchRequest } from '@ks/competition'
import { type MatchId, type UnixEpochMilliseconds } from '@ks/core'

import { MatchStorage } from '../storage/match-storage'

export function initializeMatch(storage: MatchStorage, input: InitializeMatchInput): InitializeMatchResult {
  const config = buildMatchConfig(input.matchId, input)
  const existing = storage.match()

  if (existing) {
    return existing.matchId === config.matchId &&
      existing.controlSecret === input.controlSecret &&
      isDeepStrictEqual(existing.config, config) &&
      existing.createdAt === input.createdAt
      ? { _tag: 'initialized', matchId: config.matchId }
      : { _tag: 'initialization-conflict' }
  }

  const match = createMatch(config)
  storage.commitCreation({
    config,
    controlSecret: input.controlSecret,
    createdAt: input.createdAt,
    checkpoint: match.exportCheckpoint(),
    projection: match.project(),
  })

  return { _tag: 'initialized', matchId: config.matchId }
}

export type InitializeMatchInput = CreateMatchRequest & {
  readonly matchId: MatchId
  readonly controlSecret: string
  readonly createdAt: UnixEpochMilliseconds
}

export type InitializeMatchResult =
  | { readonly _tag: 'initialized'; readonly matchId: MatchId }
  | { readonly _tag: 'initialization-conflict' }

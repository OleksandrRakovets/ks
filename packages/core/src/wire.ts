import * as v from 'valibot'

import { MatchId } from './ids'
import { NonNegativeInteger, PositiveInteger } from './valicombos'

export const MatchStreamUpdate = v.pipe(
  v.object({
    type: v.literal('command-accepted'),
    acceptedSeq: PositiveInteger,
    completesMatch: v.boolean(),
  }),
  v.readonly(),
)

export type MatchStreamUpdate = v.InferOutput<typeof MatchStreamUpdate>

export const SparringMatchLiveContractVersion = v.literal(1)

export type SparringMatchLiveContractVersion = v.InferOutput<typeof SparringMatchLiveContractVersion>

export const SparringMatchLivePageKind = v.picklist(['control', 'protocol'])

export type SparringMatchLivePageKind = v.InferOutput<typeof SparringMatchLivePageKind>

export const SparringMatchLiveQuery = v.strictObject({
  contract: v.pipe(
    v.literal('1'),
    v.transform(() => 1),
    SparringMatchLiveContractVersion,
  ),
  view: SparringMatchLivePageKind,
})

export type SparringMatchLiveQuery = v.InferOutput<typeof SparringMatchLiveQuery>

export const SparringMatchLiveUpdateMessage = v.pipe(
  v.object({
    contractVersion: SparringMatchLiveContractVersion,
    type: v.literal('update'),
    update: MatchStreamUpdate,
  }),
  v.readonly(),
)

export type SparringMatchLiveUpdateMessage = v.InferOutput<typeof SparringMatchLiveUpdateMessage>

export const SparringMatchLiveCaughtUpMessage = v.pipe(
  v.object({
    contractVersion: SparringMatchLiveContractVersion,
    type: v.literal('caught-up'),
    matchId: MatchId,
    latestSeq: NonNegativeInteger,
  }),
  v.readonly(),
)

export type SparringMatchLiveCaughtUpMessage = v.InferOutput<typeof SparringMatchLiveCaughtUpMessage>

export const SparringMatchLiveServerMessage = v.variant('type', [
  SparringMatchLiveUpdateMessage,
  SparringMatchLiveCaughtUpMessage,
])

export type SparringMatchLiveServerMessage = v.InferOutput<typeof SparringMatchLiveServerMessage>

export const SPARRING_MATCH_LIVE_FINISHED_CLOSE_CODE = 4000

export const SPARRING_MATCH_LIVE_FINISHED_CLOSE_REASON = 'match-finished'

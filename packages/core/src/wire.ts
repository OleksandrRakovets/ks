import { Schema, SchemaGetter } from 'effect'

import { MatchId } from './ids'
import { NonNegativeInteger, PositiveInteger, StrictStruct } from './valicombos'

export const MatchStreamUpdate = Schema.Struct({
  type: Schema.Literal('command-accepted'),
  acceptedSeq: PositiveInteger,
  endsMatch: Schema.Boolean,
})

export const SparringMatchLiveContractVersion = Schema.Literal(1)

export const SparringMatchLivePageKind = Schema.Literals(['control', 'protocol'])

export const SparringMatchLiveQuery = StrictStruct({
  contract: Schema.Literal('1').pipe(
    Schema.decodeTo(SparringMatchLiveContractVersion, {
      decode: SchemaGetter.transform(() => 1 as const),
      encode: SchemaGetter.transform(() => '1' as const),
    }),
  ),
  view: SparringMatchLivePageKind,
})

const SparringMatchLiveUpdateMessage = Schema.Struct({
  contractVersion: SparringMatchLiveContractVersion,
  type: Schema.Literal('update'),
  update: MatchStreamUpdate,
})

const SparringMatchLiveCaughtUpMessage = Schema.Struct({
  contractVersion: SparringMatchLiveContractVersion,
  type: Schema.Literal('caught-up'),
  matchId: MatchId,
  latestSeq: NonNegativeInteger,
})

export const SparringMatchLiveServerMessage = Schema.Union([
  SparringMatchLiveUpdateMessage,
  SparringMatchLiveCaughtUpMessage,
])

export const SPARRING_MATCH_LIVE_FINISHED_CLOSE_CODE = 4000

export const SPARRING_MATCH_LIVE_FINISHED_CLOSE_REASON = 'match-finished'

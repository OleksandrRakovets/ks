import type { MatchReadFacts, ReadMatchProtocolResult, ReadMatchResult } from '@ks/application'
import type { GameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'

type MatchData<K extends GameKey = GameKey> = Extract<ReadMatchResult<K>, { ok: true }> & {
  readonly shortGameTitle: string
}

type ProtocolData<K extends GameKey> = Extract<ReadMatchProtocolResult<K>, { ok: true }> & {
  readonly shortGameTitle: string
}

export type MatchPageDecision<Data extends { lifecycle: 'active' | 'finished' }> =
  | { readonly page: 'control'; readonly match: Extract<Data, { lifecycle: 'active' }> }
  | { readonly page: 'result'; readonly match: Extract<Data, { lifecycle: 'finished' }> }

export type MatchPageData<K extends GameKey> = MatchPageDecision<MatchData<K>>

export type ProtocolPageData<K extends GameKey> = MatchPageDecision<ProtocolData<K>>

export type ControlActionData =
  | { ok: true; acceptedSeqMax: number | null }
  | {
      ok: false
      errorKey:
        | typeof keys.match.control.invalidCommandPayload
        | typeof keys.match.control.commandRejectedByRules
        | typeof keys.match.control.unknownMatch
        | typeof keys.match.control.matchLocked
        | typeof keys.match.control.correctionUnavailable
    }

export type ActiveMatchData<K extends GameKey = GameKey> = Extract<MatchData<K>, { lifecycle: 'active' }>

export type FinishedMatchData<K extends GameKey = GameKey> = Extract<MatchData<K>, { lifecycle: 'finished' }>

export type ActiveProtocolData<K extends GameKey = GameKey> = Extract<ProtocolData<K>, { lifecycle: 'active' }>

export type FinishedProtocolData<K extends GameKey = GameKey> = Extract<
  ProtocolData<K>,
  { lifecycle: 'finished' }
>

export type FinishedSurfaceData = Extract<MatchReadFacts, { lifecycle: 'finished' }> & {
  readonly shortGameTitle: string
}

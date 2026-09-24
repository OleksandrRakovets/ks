import type { ReadMatchProtocolResult, ReadMatchResult } from '@ks/application'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'

type MatchData<K extends RegisteredGameKey = RegisteredGameKey> = Extract<ReadMatchResult<K>, { ok: true }> & {
  readonly shortGameTitle: string
}

type ProtocolData<K extends RegisteredGameKey> = Extract<ReadMatchProtocolResult<K>, { ok: true }> & {
  readonly shortGameTitle: string
}

export type MatchPageDecision<Data extends { lifecycle: 'active' | 'finished' }> =
  | { readonly page: 'control'; readonly match: Extract<Data, { lifecycle: 'active' }> }
  | { readonly page: 'result'; readonly match: Extract<Data, { lifecycle: 'finished' }> }

export type MatchPageData<K extends RegisteredGameKey> = MatchPageDecision<MatchData<K>>

export type ProtocolPageData<K extends RegisteredGameKey> = MatchPageDecision<ProtocolData<K>>

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

export type ActiveMatchData<K extends RegisteredGameKey = RegisteredGameKey> = Extract<
  MatchData<K>,
  { lifecycle: 'active' }
>

export type FinishedMatchData<K extends RegisteredGameKey = RegisteredGameKey> = Extract<
  MatchData<K>,
  { lifecycle: 'finished' }
>

export type ActiveProtocolData<K extends RegisteredGameKey = RegisteredGameKey> = Extract<
  ProtocolData<K>,
  { lifecycle: 'active' }
>

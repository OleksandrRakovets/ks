import type { ReadMatchResult } from '@ks/application'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'

type MatchData<K extends RegisteredGameKey = RegisteredGameKey> = Extract<ReadMatchResult<K>, { ok: true }> & {
  readonly shortGameTitle: string
}

export type ActiveMatchData<K extends RegisteredGameKey = RegisteredGameKey> = Extract<
  MatchData<K>,
  { lifecycle: 'active' }
>

export type FinishedMatchData<K extends RegisteredGameKey = RegisteredGameKey> = Extract<
  MatchData<K>,
  { lifecycle: 'finished' }
>

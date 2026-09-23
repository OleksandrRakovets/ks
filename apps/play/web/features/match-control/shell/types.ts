import type { ReadMatchControlResult } from '@ks/application'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'

export type MatchControlData<K extends RegisteredGameKey = RegisteredGameKey> = Extract<
  ReadMatchControlResult<K>,
  { ok: true }
> & { readonly shortGameTitle: string }

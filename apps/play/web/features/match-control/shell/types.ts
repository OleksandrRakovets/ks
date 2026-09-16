import type { ReadMatchControlResult } from '@ks/application'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'

export type MatchControlData<K extends RegisteredGameKey> = Extract<ReadMatchControlResult<K>, { ok: true }>

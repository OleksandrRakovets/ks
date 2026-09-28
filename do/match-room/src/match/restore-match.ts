import { type Match, restoreMatchCheckpoint } from '@ks/competition'

import { MatchStorage } from '../storage/match-storage'
import type { MatchRecord } from '../storage/records'

export function restoreMatch(storage: MatchStorage, matchRecord: MatchRecord): Match {
  try {
    return restoreMatchCheckpoint(storage.readCurrentCheckpoint(matchRecord))
  } catch (cause) {
    throw new Error('MatchRoom checkpoint storage corruption', { cause })
  }
}

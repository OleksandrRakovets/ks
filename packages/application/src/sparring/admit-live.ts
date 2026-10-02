import type { MatchId } from '@ks/core'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Effect } from 'effect'

import type { SparringApplication } from './contract'
import { SparringMatchStorage } from './storage/sparring-match-storage'

export const admitMatchLive = Effect.fn('admitMatchLive')(function* (
  matchId: MatchId,
): Effect.fn.Return<
  Awaited<ReturnType<SparringApplication['admitMatchLive']>>,
  EffectDrizzleQueryError,
  SparringMatchStorage
> {
  const matches = yield* SparringMatchStorage
  const record = yield* matches.findMatch(matchId)

  if (!record) return { _tag: 'unknown' }

  if (record.status === 'finished') return { _tag: 'finished' }

  if (record.status === 'creating') throw new Error('Creating Match cannot be admitted to the live transport')

  return { _tag: 'admitted' }
})

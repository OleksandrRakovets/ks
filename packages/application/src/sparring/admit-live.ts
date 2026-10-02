import type { MatchId } from '@ks/core'
import { Effect } from 'effect'

import { MatchFinished, MatchNotFound } from './errors'
import { SparringMatchStorage } from './storage/sparring-match-storage'

export const liveMethods = Effect.gen(function* () {
  const matches = yield* SparringMatchStorage

  const admitMatchLive = Effect.fn('SparringService.admitMatchLive')(function* (matchId: MatchId) {
    const record = yield* matches.findMatch(matchId)

    if (!record) return yield* Effect.fail(new MatchNotFound())

    if (record.status === 'finished') return yield* Effect.fail(new MatchFinished())

    if (record.status === 'creating')
      throw new Error('Creating Match cannot be admitted to the live transport')

    return undefined
  })

  return { admitMatchLive }
})

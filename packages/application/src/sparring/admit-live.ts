import type { MatchId } from '@ks/core'

import type { SparringApplication } from './contract'
import type { SparringDependencies } from './sparring-application'

export async function admitMatchLive(
  deps: SparringDependencies,
  matchId: MatchId,
): ReturnType<SparringApplication['admitMatchLive']> {
  const record = await deps.matches.findMatch(matchId)

  if (!record || record.status === 'discarded') return { _tag: 'unknown' }

  if (record.status === 'finished') return { _tag: 'finished' }

  if (record.status === 'creating') throw new Error('Creating Match cannot be admitted to the live transport')

  return { _tag: 'admitted' }
}

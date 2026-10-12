import type { MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'

import type { DiscardMatchResult } from './contract'
import type { SparringDependencies } from './sparring-application'

/** Soft-deletes an Active Match; repeat requests complete a failed D1 write without archiving history. */
export async function discardMatch(
  deps: SparringDependencies,
  matchId: MatchId,
  expectedGameKey: GameKey,
): Promise<DiscardMatchResult> {
  const record = await deps.matches.findMatch(matchId)

  if (!record || record.gameKey !== expectedGameKey || record.status === 'creating')
    return { ok: false, reason: 'unknown-match' }

  if (record.status === 'discarded') return { ok: true }

  if (record.status === 'finished') return { ok: false, reason: 'match-locked' }

  const result = await deps.matchRoomClient(matchId).discard()

  if (result._tag === 'finalizing') return { ok: false, reason: 'match-locked' }

  await deps.matches.markDiscarded(matchId, result.endedAt)

  return { ok: true }
}

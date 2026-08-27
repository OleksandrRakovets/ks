import type { MatchId } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'

export function matchControlUrl(gameKey: RegisteredGameKey, matchId: MatchId): string {
  return `/match/${gameKey}/${matchId}/control/`
}

export function matchProtocolUrl(gameKey: RegisteredGameKey, matchId: MatchId): string {
  return `/match/${gameKey}/${matchId}/protocol/`
}

export function matchUrlForStatus(
  gameKey: RegisteredGameKey,
  matchId: MatchId,
  status: 'active' | 'finished',
): string {
  return status === 'active' ? matchControlUrl(gameKey, matchId) : matchProtocolUrl(gameKey, matchId)
}

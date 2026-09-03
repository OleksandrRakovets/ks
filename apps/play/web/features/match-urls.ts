import type { MatchId } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import { localizedPath } from '../locale'

export function matchControlUrl(
  gameKey: RegisteredGameKey,
  matchId: MatchId,
  locale: SupportedLocale,
): string {
  return localizedPath(`/match/${gameKey}/${matchId}/control/`, locale)
}

export function matchProtocolUrl(
  gameKey: RegisteredGameKey,
  matchId: MatchId,
  locale: SupportedLocale,
): string {
  return localizedPath(`/match/${gameKey}/${matchId}/protocol/`, locale)
}

export function matchUrlForStatus(
  gameKey: RegisteredGameKey,
  matchId: MatchId,
  status: 'active' | 'finished',
  locale: SupportedLocale,
): string {
  return status === 'active'
    ? matchControlUrl(gameKey, matchId, locale)
    : matchProtocolUrl(gameKey, matchId, locale)
}

import type { CreateMatchInput } from '@ks/application'
import type { MatchId } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import { localizedPath } from '../locale'

export function matchSetupUrl(
  gameKey: RegisteredGameKey,
  locale: SupportedLocale,
  rematch?: Pick<CreateMatchInput, 'playerNames' | 'targets' | 'gameConfiguration'>,
): string {
  const path = localizedPath(`/sparring/init/${gameKey}/`, locale)

  if (!rematch) return path

  const search = new URLSearchParams({
    rematch: '1',
    seatAName: rematch.playerNames.A,
    seatBName: rematch.playerNames.B,
    matchTargetFrames: String(rematch.targets.matchTargetFrames),
    targetA: String(rematch.targets.frameTargetPointsBySeat.A),
    targetB: String(rematch.targets.frameTargetPointsBySeat.B),
  })

  if (rematch.gameConfiguration?.rackRollover !== undefined) {
    search.set('rackRollover', String(rematch.gameConfiguration.rackRollover))
  }

  return `${path}?${search.toString()}`
}

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

import type { CreateSparringMatchInput } from '@ks/application'
import type { MatchId } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import { localizedPath } from '@/i18n'

export function matchSetupUrl(
  gameKey: RegisteredGameKey,
  locale: SupportedLocale,
  rematch?: Pick<CreateSparringMatchInput, 'playerNames' | 'targets' | 'gameConfiguration'>,
): string {
  const path = localizedPath(`/sparring/setup/${gameKey}/`, locale)

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

export function matchUrl(gameKey: RegisteredGameKey, matchId: MatchId, locale: SupportedLocale): string {
  return localizedPath(`/sparring/match/${gameKey}/${matchId}/`, locale)
}

export function matchProtocolUrl(
  gameKey: RegisteredGameKey,
  matchId: MatchId,
  locale: SupportedLocale,
): string {
  return localizedPath(`/sparring/match/${gameKey}/${matchId}/protocol/`, locale)
}

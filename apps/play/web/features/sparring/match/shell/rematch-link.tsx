import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '@/components/ui'
import type { FinishedMatchData } from '@/features/sparring/match/types'
import { matchSetupUrl } from '@/features/sparring/urls'
import { useRootLocale } from '@/root'

export function RematchLink<K extends RegisteredGameKey>(props: { data: FinishedMatchData<K> }) {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const { state } = props.data
  const rackRollover = state.gameConfiguration?.rackRollover

  if (state.gameKey === 'free-pyramid-long' && rackRollover === undefined) return null

  const rematch = {
    playerNames: {
      A: props.data.participants.A.displayName,
      B: props.data.participants.B.displayName,
    },
    targets: state.targets,
  }

  const to = matchSetupUrl(
    state.gameKey,
    locale,
    state.gameConfiguration === undefined
      ? rematch
      : { ...rematch, gameConfiguration: state.gameConfiguration },
  )

  return (
    <div className="shrink-0 px-4 py-3">
      <Button
        render={<Link to={to} prefetch="intent" />}
        variant="outline"
        size="touch"
        className="h-14 w-full text-lg font-semibold"
      >
        {t(keys.match.sparring.rematchSamePlayers)}
      </Button>
    </div>
  )
}

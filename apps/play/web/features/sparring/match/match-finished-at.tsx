import type { ReadMatchResult } from '@ks/application'
import type { GameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

type FinishedMatchData = Extract<
  ReadMatchResult<GameKey>,
  { readonly ok: true; readonly lifecycle: 'finished' }
>

export function MatchFinishedAt({
  endedAtIso,
  endedAtTime,
  endedAtDate,
  endedAtIsToday,
}: Pick<FinishedMatchData, 'endedAtIso' | 'endedAtTime' | 'endedAtDate' | 'endedAtIsToday'>) {
  const { t } = useTranslation()
  const date = `${endedAtDate.day}.${endedAtDate.month}.${endedAtDate.year}`

  return (
    <p className="px-4 py-[18px] text-center text-base text-muted-foreground">
      <time dateTime={endedAtIso}>
        {t(endedAtIsToday ? keys.match.result.finishedTodayAt : keys.match.result.finishedOnAt, {
          date,
          time: endedAtTime,
        })}
      </time>
    </p>
  )
}

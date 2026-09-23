import type { ReadMatchControlResult } from '@ks/application'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

type FinishedControlData = Extract<
  ReadMatchControlResult<RegisteredGameKey>,
  { readonly ok: true; readonly controlState: 'finished' }
>

export function MatchFinishedAt({
  endedAt,
  endedAtIsToday,
}: Pick<FinishedControlData, 'endedAt' | 'endedAtIsToday'>) {
  const { t } = useTranslation()
  const date = `${endedAt.date.day}.${endedAt.date.month}.${endedAt.date.year}`

  return (
    <p className="px-4 py-[18px] text-center text-base text-muted-foreground">
      <time dateTime={endedAt.isoString}>
        {t(endedAtIsToday ? keys.match.result.finishedTodayAt : keys.match.result.finishedOnAt, {
          date,
          time: endedAt.time,
        })}
      </time>
    </p>
  )
}

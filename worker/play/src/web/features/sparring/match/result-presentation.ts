import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

import type { FinishedMatchData } from '@/features/sparring/match/types'

export type ResultPresentation = ReturnType<typeof presentResult>

export function presentResult(data: FinishedMatchData, t: TFunction) {
  return {
    title: t(data.resultScores.kind === 'racks' ? keys.match.result.racks : keys.match.result.frames),
    rows: data.resultScores.rows,
    endedAtIso: data.endedAtIso,
    finishedLabel: t(
      data.endedAtIsToday ? keys.match.result.finishedTodayAt : keys.match.result.finishedOnAt,
      {
        date: `${data.endedAtDate.day}.${data.endedAtDate.month}.${data.endedAtDate.year}`,
        time: data.endedAtTime,
      },
    ),
  }
}

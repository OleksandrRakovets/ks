import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

import type { FinishedMatchData } from './types'

export type ResultPresentation = ReturnType<typeof presentResult>

export function presentResult(data: FinishedMatchData, t: TFunction) {
  const scores =
    data.gameResult?.gameKey === 'free-pyramid-long'
      ? {
          title: t(keys.match.result.racks),
          rows: data.gameResult.racks.map((rack) => ({ index: rack.rackNumber, score: rack.scoreBySeat })),
        }
      : {
          title: t(keys.match.result.frames),
          rows: data.state.frames.map((frame) => ({ index: frame.frameIndex, score: frame.pointsBySeat })),
        }

  return {
    ...scores,
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

import type { ProtocolRow } from '@ks/application'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

export type ProtocolItem =
  | { kind: 'frame-header'; key: string; frameIndex: number }
  | { kind: 'row'; row: ProtocolRow; timeMarker?: string }

/**
 * Orders Protocol rows for the spine. Active matches read newest first, so observers at the top see the latest
 * action; finished matches read oldest first. Either way a header opens each frame's group in frame-based games,
 * and a lane row carries a five-minute time marker when its bucket differs from the previous marker in display
 * order or it is its frame's first lane row. The effective match time appears only for two or more frames.
 */
export function presentProtocolItems(
  rows: readonly ProtocolRow[],
  options: { showsFrames: boolean; newestFirst: boolean },
): ProtocolItem[] {
  const frameCount = rows.filter((row) => row.kind === 'frame-result').length
  const frames: ProtocolRow[][] = []

  for (const row of rows) {
    if (row.kind === 'match-ended' && frameCount < 2) continue

    const current = frames.at(-1)

    if (current?.[0]?.frameIndex === row.frameIndex) current.push(row)
    else frames.push([row])
  }

  if (options.newestFirst) {
    frames.reverse()

    for (const frame of frames) frame.reverse()
  }

  const items: ProtocolItem[] = []

  for (const frame of frames) {
    const frameIndex = frame[0]?.frameIndex ?? 0
    let markedBucket: string | undefined

    if (options.showsFrames) items.push({ kind: 'frame-header', key: `frame-${frameIndex}`, frameIndex })

    for (const row of frame) {
      const bucket = row.kind === 'lane' ? fiveMinuteBucket(row.acceptedAtLabel) : undefined

      if (bucket === undefined || bucket === markedBucket) {
        items.push({ kind: 'row', row })
        continue
      }

      markedBucket = bucket
      items.push({ kind: 'row', row, timeMarker: bucket })
    }
  }

  return items
}

/** Formats a best-effort duration in whole minutes, with hours from one hour up. */
export function formatProtocolDuration(t: TFunction, durationMs: number): string {
  const totalMinutes = Math.max(1, Math.round(durationMs / 60_000))

  if (totalMinutes < 60) return t(keys.match.protocol.durationMinutes, { minutes: totalMinutes })

  if (totalMinutes % 60 === 0) return t(keys.match.protocol.durationWholeHours, { hours: totalMinutes / 60 })

  return t(keys.match.protocol.durationHours, {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  })
}

/** Formats a score for the spine and bands, with a true minus sign for Owed Balls. */
export function formatProtocolPoints(points: number): string {
  return points < 0 ? `−${-points}` : String(points)
}

function fiveMinuteBucket(timeLabel: string): string {
  const [hours = '', minutes = ''] = timeLabel.split(':')

  return `${hours}:${String(Math.floor(Number(minutes) / 5) * 5).padStart(2, '0')}`
}

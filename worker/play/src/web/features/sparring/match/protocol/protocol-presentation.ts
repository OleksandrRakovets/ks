import type { ProtocolRow } from '@ks/application'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

export type ProtocolItem =
  | { kind: 'frame-header'; key: string; frameIndex: number }
  | { kind: 'row'; row: ProtocolRow; timeMarker?: string }

/**
 * Orders Protocol rows for the spine: a header opens each frame of frame-based games, and a lane row starts
 * a new five-minute time marker when its bucket differs from the last marker or it opens a frame.
 * The effective match time appears only when it differs from the single frame's own duration.
 */
export function presentProtocolItems(rows: readonly ProtocolRow[], showsFrames: boolean): ProtocolItem[] {
  const items: ProtocolItem[] = []
  const frameCount = rows.filter((row) => row.kind === 'frame-result').length
  let frameIndex = 0
  let markedBucket: string | undefined

  for (const row of rows) {
    if (row.frameIndex !== frameIndex) {
      frameIndex = row.frameIndex
      markedBucket = undefined

      if (showsFrames) items.push({ kind: 'frame-header', key: `frame-${frameIndex}`, frameIndex })
    }

    if (row.kind === 'match-ended' && frameCount < 2) continue

    if (row.kind !== 'lane') {
      items.push({ kind: 'row', row })
      continue
    }

    const bucket = fiveMinuteBucket(row.acceptedAtLabel)

    if (bucket === markedBucket) {
      items.push({ kind: 'row', row })
      continue
    }

    markedBucket = bucket
    items.push({ kind: 'row', row, timeMarker: bucket })
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

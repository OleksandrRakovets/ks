import type { SparringMatchRoomProjection } from '@ks/competition'
import type { ControlCommandSections, MatchSnapshot } from '@ks/core'
import type { ControlProjectionFor, RegisteredGameKey } from '@ks/gameplay/definitions'

type RoomSnapshotSuccessFor<K extends RegisteredGameKey> = {
  ok: true
  snapshot: MatchSnapshot & { gameKey: K }
  controlProjection: ControlProjectionFor<K> | undefined
  controlSections: ControlCommandSections
}

export type RoomSnapshotSuccess = {
  [K in RegisteredGameKey]: RoomSnapshotSuccessFor<K>
}[RegisteredGameKey]

export function wrapRoomSnapshot(projection: SparringMatchRoomProjection): RoomSnapshotSuccess {
  switch (projection.snapshot.gameKey) {
    case 'strila-v2':
      return { ok: true, ...projection }
    case 'free-pyramid':
      return { ok: true, ...projection }
    case 'free-pyramid-long':
      return { ok: true, ...projection }
    case 'combined-pyramid':
      return { ok: true, ...projection }
    case 'combined-pyramid-old':
      return { ok: true, ...projection }
  }
}

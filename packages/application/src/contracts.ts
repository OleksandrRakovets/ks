import type { CreateMatchRequest, MatchSnapshotFor } from '@ks/competition'
import type { CommandId, ControlCommand, ControlCommandSections, MatchId, UnixEpochMilliseconds } from '@ks/core'
import type { ControlProjectionFor, RegisteredGameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import type { ProtocolRow } from './protocol'

export type HydratedParticipant = {
  playerRef: string
  displayName: string
  shortDisplayName: string
}

export type HydratedMatchParticipants = {
  A: HydratedParticipant
  B: HydratedParticipant
}

export type CreateMatchInput = Omit<CreateMatchRequest, 'participants'> & {
  playerNames: { A: string; B: string }
}

export type CreateMatchResult = { ok: true; matchId: MatchId } | { ok: false; error: string; status: number }

export type MatchListEntry = {
  matchId: MatchId
  gameKey: RegisteredGameKey
  gameTitle: string
  status: 'active' | 'finished'
  createdAt: UnixEpochMilliseconds
  participants: HydratedMatchParticipants
}

export type ReadMatchFailure = { ok: false; error: string; status: number }

export type ReadMatchControlResult<K extends RegisteredGameKey> =
  | {
      ok: true
      state: 'frame-active'
      snapshot: MatchSnapshotFor<K>
      controlProjection: ControlProjectionFor<K>
      controlSections: ControlCommandSections
      participants: HydratedMatchParticipants
    }
  | {
      ok: true
      state: 'between-frames'
      snapshot: MatchSnapshotFor<K>
      controlSections: ControlCommandSections
      participants: HydratedMatchParticipants
    }
  | ReadMatchFailure

export type CommandMatchResult =
  | { ok: true; accepted: { seq: number; factId: string }[] }
  | { ok: false; error: string; status: number }

export type ReadMatchProtocolResult<K extends RegisteredGameKey> =
  | {
      ok: true
      snapshot: MatchSnapshotFor<K>
      controlProjection?: ControlProjectionFor<K>
      participants: HydratedMatchParticipants
      protocolRows: ProtocolRow[]
    }
  | ReadMatchFailure

export type Application = {
  createMatch(input: CreateMatchInput): Promise<CreateMatchResult>
  listMatches(locale: SupportedLocale): Promise<MatchListEntry[]>
  readMatchControl<K extends RegisteredGameKey>(
    matchId: MatchId,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchControlResult<K>>
  commandMatch<K extends RegisteredGameKey>(
    matchId: string,
    commandId: CommandId,
    command: ControlCommand,
    expectedGameKey: K,
  ): Promise<CommandMatchResult>
  readMatchProtocol<K extends RegisteredGameKey>(
    matchId: MatchId,
    timeZone: string,
    locale: SupportedLocale,
    expectedGameKey: K,
  ): Promise<ReadMatchProtocolResult<K>>
  streamMatchFacts(matchId: string, since?: number): Promise<Response>
}

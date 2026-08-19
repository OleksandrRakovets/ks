import type { CreateMatchRequest } from '@ks/competition'
import type { CommandId, ControlCommand, MatchSnapshot } from '@ks/core'
import type { GameControlProjection } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import type { ProtocolRow } from './protocol'

export type HydratedParticipant = {
  playerRef: string
  displayName: string
  shortDisplayName: string
}

export type HydratedParticipants = {
  A: HydratedParticipant
  B: HydratedParticipant
}

export type CreateMatchInput = Omit<CreateMatchRequest, 'participants'> & {
  playerNames: { A: string; B: string }
}

export type CreateMatchResult = { ok: true; matchId: string } | { ok: false; error: string; status: number }

export type MatchListEntry = {
  matchId: string
  gameKey: string
  gameTitle: string
  status: 'active' | 'finished'
  createdAt: number
  participants: HydratedParticipants
}

export type ReadMatchResult =
  | {
      ok: true
      snapshot: MatchSnapshot
      participants: HydratedParticipants
      controlProjection?: GameControlProjection
      controlSections?: import('@ks/core').ControlCommandSections
    }
  | { ok: false; error: string; status: number }

export type CommandMatchResult =
  | { ok: true; accepted: { seq: number; factId: string }[] }
  | { ok: false; error: string; status: number }

export type ReadMatchProtocolResult =
  | (Extract<ReadMatchResult, { ok: true }> & { protocolRows: ProtocolRow[] })
  | Extract<ReadMatchResult, { ok: false }>

export type Application = {
  createMatch(input: CreateMatchInput): Promise<CreateMatchResult>
  listMatches(locale: SupportedLocale): Promise<MatchListEntry[]>
  readMatch(matchId: string, locale: SupportedLocale): Promise<ReadMatchResult>
  commandMatch(matchId: string, commandId: CommandId, command: ControlCommand): Promise<CommandMatchResult>
  readMatchProtocol(matchId: string, timeZone: string, locale: SupportedLocale): Promise<ReadMatchProtocolResult>
  streamMatchFacts(matchId: string, since?: number): Promise<Response>
}

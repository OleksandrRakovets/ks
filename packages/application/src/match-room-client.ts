import type { CreateMatchRequest, MatchSnapshotFor } from '@ks/competition'
import type {
  CommandId,
  ControlCommand,
  ControlCommandSections,
  MatchId,
  StoredMatchFact,
  UnixEpochMilliseconds,
} from '@ks/core'
import type { ControlProjectionFor, RegisteredGameKey } from '@ks/gameplay/definitions'

import type { CommandMatchResult, ReadMatchFailure } from './contracts'

export type MatchRoomCreateRequest = CreateMatchRequest & {
  matchId: MatchId
  controlSecret: string
  createdAt: UnixEpochMilliseconds
}
export type MatchRoomFinalizationData = {
  sourceLatestSeq: number
  endedAt: UnixEpochMilliseconds
  facts: StoredMatchFact[]
}
type MatchRoomFailure = { ok: false; error: string; status: number }
type MatchRoomCreateResult = { ok: true; matchId: MatchId } | MatchRoomFailure
type MatchRoomCommandResult =
  | (Extract<CommandMatchResult, { ok: true }> & { finalizing?: true })
  | Extract<CommandMatchResult, { ok: false }>
type MatchRoomSnapshotSuccess = {
  [K in RegisteredGameKey]: {
    ok: true
    snapshot: MatchSnapshotFor<K>
    controlProjection: ControlProjectionFor<K> | undefined
    controlSections: ControlCommandSections
  }
}[RegisteredGameKey]
export type MatchRoomSnapshotResult = MatchRoomSnapshotSuccess | ReadMatchFailure
type MatchRoomStub = {
  create(request: MatchRoomCreateRequest): Promise<MatchRoomCreateResult>
  snapshot(args: { matchId: MatchId }): Promise<MatchRoomSnapshotResult>
  facts(args: { matchId: MatchId; commandId: CommandId; command: ControlCommand }): Promise<MatchRoomCommandResult>
  stream(args: { matchId: MatchId; since?: number }): Promise<Response>
  listFacts(args: { matchId: MatchId }): Promise<{ ok: true; facts: StoredMatchFact[] } | MatchRoomFailure>
  finalization(args: { matchId: MatchId }): Promise<{ ok: true; data: MatchRoomFinalizationData } | MatchRoomFailure>
  disposeFinalized(args: { matchId: MatchId }): Promise<{ ok: true } | MatchRoomFailure>
}

export type MatchRoomClient = ReturnType<typeof createMatchRoomClient>

export function createMatchRoomClient(namespace: { getByName(name: string): MatchRoomStub }) {
  return {
    create: async (request: MatchRoomCreateRequest): Promise<MatchRoomCreateResult> =>
      await namespace.getByName(request.matchId).create(request),
    snapshot: async (matchId: MatchId): Promise<MatchRoomSnapshotResult> =>
      await namespace.getByName(matchId).snapshot({ matchId }),
    command: async (matchId: MatchId, commandId: CommandId, command: ControlCommand): Promise<MatchRoomCommandResult> =>
      await namespace.getByName(matchId).facts({ matchId, commandId, command }),
    stream: async (matchId: MatchId, since?: number) =>
      since === undefined
        ? await namespace.getByName(matchId).stream({ matchId })
        : await namespace.getByName(matchId).stream({ matchId, since }),
    facts: async (matchId: MatchId) => await namespace.getByName(matchId).listFacts({ matchId }),
    finalization: async (matchId: MatchId) => await namespace.getByName(matchId).finalization({ matchId }),
    disposeFinalized: async (matchId: MatchId) => await namespace.getByName(matchId).disposeFinalized({ matchId }),
  }
}

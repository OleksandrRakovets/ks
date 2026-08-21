import type { CreateMatchRequest, MatchSnapshotFor } from '@ks/competition'
import type { CommandId, ControlCommand, ControlCommandSections, StoredFact, UnixEpochMilliseconds } from '@ks/core'
import type { ControlProjectionFor, RegisteredGameKey } from '@ks/gameplay/definitions'

import type { CommandMatchResult, ReadMatchFailure } from './contracts'

export type MatchRoomCreateRequest = CreateMatchRequest & {
  matchId: string
  controlSecret: string
  createdAt: UnixEpochMilliseconds
}
export type MatchRoomFinalizationData = {
  sourceLatestSeq: number
  endedAt: UnixEpochMilliseconds
  facts: StoredFact[]
}
type MatchRoomFailure = { ok: false; error: string; status: number }
type MatchRoomCreateResult = { ok: true; matchId: string } | MatchRoomFailure
type MatchRoomCommandResult =
  | (Extract<CommandMatchResult, { ok: true }> & { finalizing?: true })
  | Extract<CommandMatchResult, { ok: false }>
export type MatchRoomSnapshotSuccess = {
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
  snapshot(args: { matchId: string }): Promise<MatchRoomSnapshotResult>
  facts(args: { matchId: string; commandId: CommandId; command: ControlCommand }): Promise<MatchRoomCommandResult>
  stream(args: { matchId: string; since?: number }): Promise<Response>
  listFacts(args: { matchId: string }): Promise<{ ok: true; facts: StoredFact[] } | MatchRoomFailure>
  finalization(args: { matchId: string }): Promise<{ ok: true; data: MatchRoomFinalizationData } | MatchRoomFailure>
  disposeFinalized(args: { matchId: string }): Promise<{ ok: true } | MatchRoomFailure>
}

export type MatchRoomClient = ReturnType<typeof createMatchRoomClient>

export function createMatchRoomClient(namespace: { getByName(name: string): MatchRoomStub }) {
  return {
    create: async (request: MatchRoomCreateRequest): Promise<MatchRoomCreateResult> =>
      await namespace.getByName(request.matchId).create(request),
    snapshot: async (matchId: string): Promise<MatchRoomSnapshotResult> =>
      await namespace.getByName(matchId).snapshot({ matchId }),
    command: async (matchId: string, commandId: CommandId, command: ControlCommand): Promise<MatchRoomCommandResult> =>
      await namespace.getByName(matchId).facts({ matchId, commandId, command }),
    stream: async (matchId: string, since?: number) =>
      since === undefined
        ? await namespace.getByName(matchId).stream({ matchId })
        : await namespace.getByName(matchId).stream({ matchId, since }),
    facts: async (matchId: string) => await namespace.getByName(matchId).listFacts({ matchId }),
    finalization: async (matchId: string) => await namespace.getByName(matchId).finalization({ matchId }),
    disposeFinalized: async (matchId: string) => await namespace.getByName(matchId).disposeFinalized({ matchId }),
  }
}

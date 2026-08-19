import type { CreateMatchRequest } from '@ks/competition'
import type { CommandId, ControlCommand } from '@ks/core'
import type { MatchRoom } from '@ks/match-room'

import type { CommandMatchResult, CreateMatchResult, ReadMatchResult } from './contracts'

export type MatchRoomCreateRequest = CreateMatchRequest & { matchId: string; controlSecret: string; createdAt: number }
export type MatchRoomCommandResult = CommandMatchResult & {
  completion?: { sourceLatestSeq: number; endedAt: number } | undefined
}

export type MatchRoomClient = ReturnType<typeof createMatchRoomClient>

export function createMatchRoomClient(namespace: DurableObjectNamespace<MatchRoom>) {
  return {
    create: async (request: MatchRoomCreateRequest): Promise<CreateMatchResult> =>
      await namespace.getByName(request.matchId).create(request),
    snapshot: async (
      matchId: string,
    ): Promise<Omit<Extract<ReadMatchResult, { ok: true }>, 'participants'> | Extract<ReadMatchResult, { ok: false }>> =>
      await namespace.getByName(matchId).snapshot({ matchId }),
    command: async (matchId: string, commandId: CommandId, command: ControlCommand): Promise<MatchRoomCommandResult> =>
      await namespace.getByName(matchId).facts({ matchId, commandId, command }),
    stream: async (matchId: string, since?: number) =>
      since === undefined
        ? await namespace.getByName(matchId).stream({ matchId })
        : await namespace.getByName(matchId).stream({ matchId, since }),
    facts: async (matchId: string): Promise<Awaited<ReturnType<MatchRoom['listFacts']>>> =>
      await namespace.getByName(matchId).listFacts({ matchId }),
  }
}

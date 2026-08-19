import type { CreateMatchRequest } from '@ks/competition'
import {
  AcceptedFactSchema,
  ControlCommandSectionsSchema,
  MatchSnapshotSchema,
  NonEmptyStringSchema,
  PositiveIntegerSchema,
  StoredFactSchema,
  type CommandId, type ControlCommand,
} from '@ks/core'
import { GameControlProjectionSchema } from '@ks/gameplay/definitions'
import * as v from 'valibot'

import type { CommandMatchResult, CreateMatchResult } from './contracts'

export type MatchRoomCreateRequest = CreateMatchRequest & { matchId: string; controlSecret: string }

type MatchRoomStub = {
  create(args: MatchRoomCreateRequest): Promise<CreateMatchResult>
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The DO response is untrusted and parsed by this adapter.
  snapshot(args: { matchId: string }): Promise<unknown>
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The DO response is untrusted and parsed by this adapter.
  facts(args: { matchId: string; controlSecret: string; commandId: CommandId; commands: ControlCommand[] }): Promise<unknown>
  stream(args: { matchId: string; since?: number }): Promise<Response>
  factsForProtocol(args: { matchId: string }): Promise<unknown>
}

const SnapshotResultSchema = v.union([
  v.object({
    ok: v.literal(true),
    snapshot: MatchSnapshotSchema,
    controlProjection: v.optional(GameControlProjectionSchema),
    controlSections: v.optional(ControlCommandSectionsSchema),
  }),
  v.object({
    ok: v.literal(false),
    error: NonEmptyStringSchema,
    status: v.optional(PositiveIntegerSchema),
  }),
])

const CommandResultSchema = v.union([
  v.object({
    ok: v.literal(true),
    accepted: v.array(AcceptedFactSchema),
  }),
  v.object({
    ok: v.literal(false),
    error: NonEmptyStringSchema,
    status: PositiveIntegerSchema,
  }),
])

export type MatchRoomClient = ReturnType<typeof createMatchRoomClient>

export function createMatchRoomClient(namespace: { getByName(name: string): object }) {
  function stubFor(matchId: string): MatchRoomStub {
    // SAFETY: The production binding names MatchRoom, whose public RPC methods are described by MatchRoomStub.
    return namespace.getByName(matchId) as MatchRoomStub
  }

  return {
    create: async (request: MatchRoomCreateRequest) => await stubFor(request.matchId).create(request),
    snapshot: async (matchId: string) => {
      const parsed = v.safeParse(SnapshotResultSchema, await stubFor(matchId).snapshot({ matchId }))
      if (!parsed.success) return { ok: false, error: 'Failed to parse snapshot response', status: 502 } as const
      return parsed.output
    },
    command: async (matchId: string, controlSecret: string, commandId: CommandId, commands: ControlCommand[]): Promise<CommandMatchResult> => {
      const parsed = v.safeParse(CommandResultSchema, await stubFor(matchId).facts({ matchId, controlSecret, commandId, commands }))
      if (!parsed.success) return { ok: false, error: 'Failed to parse command response', status: 502 }
      return parsed.output
    },
    stream: async (matchId: string, since?: number) =>
      since === undefined ? await stubFor(matchId).stream({ matchId }) : await stubFor(matchId).stream({ matchId, since }),
    facts: async (matchId: string) => {
      const parsed = v.safeParse(v.array(StoredFactSchema), await stubFor(matchId).factsForProtocol({ matchId }))
      return parsed.success ? parsed.output : []
    },
  }
}

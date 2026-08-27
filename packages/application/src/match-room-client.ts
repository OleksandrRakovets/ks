import { type CreateMatchRequest, type MatchStateFor, SparringMatchRejectionSchema } from '@ks/competition'
import {
  ControlSections,
  type MatchCommand,
  type MatchId,
  MatchIdSchema,
  MatchStateSchema,
  NonEmptyStoredProtocolEntriesSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  StoredProtocolEntrySchema,
  type UnixEpochMilliseconds,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import { type ControlProjectionFor, type RegisteredGameKey, RegisteredGameKeySchema } from '@ks/gameplay/definitions'
import { parseGameControl } from '@ks/gameplay/server'
import * as v from 'valibot'

import type { CommandReceiptOutcome, ReadMatchFailure } from './contracts'

export type MatchRoomCreateRequest = CreateMatchRequest & {
  matchId: MatchId
  controlSecret: string
  createdAt: UnixEpochMilliseconds
}
export type MatchRoomFinalizationData = v.InferOutput<typeof CompletedMatchTransferSchema>
export type MatchRoomReadResult<K extends RegisteredGameKey = RegisteredGameKey> =
  | {
      ok: true
      latestSeq: number
      state: MatchStateFor<K>
      controlProjection?: ControlProjectionFor<K>
      controlSections: ControlSections
    }
  | ReadMatchFailure
export interface MatchRoomClient {
  create(request: MatchRoomCreateRequest): Promise<{ ok: true; matchId: MatchId } | Failure>
  readControl<K extends RegisteredGameKey>(matchId: MatchId, expectedGameKey: K): Promise<MatchRoomReadResult<K>>
  readProtocol<K extends RegisteredGameKey>(
    matchId: MatchId,
    expectedGameKey: K,
  ): Promise<
    | {
        ok: true
        latestSeq: number
        state: MatchStateFor<K>
        protocolEntries: v.InferOutput<typeof StoredProtocolEntrySchema>[]
      }
    | Failure
  >
  submitCommand(
    matchId: MatchId,
    command: MatchCommand,
  ): Promise<{ ok: true; outcome: CommandReceiptOutcome; finalizing?: true } | Failure>
  stream(matchId: MatchId, since?: number): Promise<Response>
  finalization(matchId: MatchId): Promise<{ ok: true; data: MatchRoomFinalizationData } | Failure>
  disposeFinalized(matchId: MatchId): Promise<{ ok: true } | Failure>
}
type Failure = { ok: false; error: string; status: number }
/** Untrusted structural result returned by the private MatchRoom RPC stub before boundary validation. */
interface StructuredRpcResult {
  readonly ok?: unknown
  readonly matchId?: unknown
  readonly state?: unknown
  readonly latestSeq?: unknown
  readonly controlProjection?: unknown
  readonly controlSections?: unknown
  readonly protocolEntries?: unknown
  readonly outcome?: unknown
  readonly finalizing?: unknown
  readonly data?: unknown
  readonly error?: unknown
  readonly status?: unknown
}
/** Structural subset of the external Durable Object stub consumed by application. */
type MatchRoomStub = {
  create(request: MatchRoomCreateRequest): Promise<StructuredRpcResult>
  readControl(args: { matchId: MatchId }): Promise<StructuredRpcResult>
  readProtocol(args: { matchId: MatchId }): Promise<StructuredRpcResult>
  submitCommand(args: { matchId: MatchId; command: MatchCommand }): Promise<StructuredRpcResult>
  stream(args: { matchId: MatchId; since?: number }): Promise<Response>
  finalization(args: { matchId: MatchId }): Promise<StructuredRpcResult>
  disposeFinalized(args: { matchId: MatchId }): Promise<StructuredRpcResult>
}

const FailureSchema = v.object({
  ok: v.literal(false),
  error: NonEmptyStringSchema,
  status: v.pipe(v.number(), v.integer(), v.minValue(400), v.maxValue(599)),
})
const StateSchema = v.intersect([MatchStateSchema, v.object({ gameKey: RegisteredGameKeySchema })])
const ActiveStateSchema = v.intersect([StateSchema, v.object({ status: v.literal('active') })])
const FinishedStateSchema = v.intersect([StateSchema, v.object({ status: v.literal('finished') })])
const ProjectionSchema = v.object({
  gameKey: v.string(),
  projection: v.literal('control'),
  score: v.object({ A: v.number(), B: v.number() }),
  details: v.optional(v.unknown()),
})
const OutcomeSchema = v.variant('_tag', [
  v.object({ _tag: v.literal('accepted'), acceptedSeq: PositiveIntegerSchema }),
  v.object({ _tag: v.literal('rejected'), reason: SparringMatchRejectionSchema }),
])
const ControlResultSchema = v.variant('ok', [
  v.object({
    ok: v.literal(true),
    latestSeq: NonNegativeIntegerSchema,
    state: ActiveStateSchema,
    controlProjection: v.optional(ProjectionSchema),
    controlSections: ControlSections,
  }),
  FailureSchema,
])
const ProtocolResultSchema = v.variant('ok', [
  v.object({
    ok: v.literal(true),
    latestSeq: NonNegativeIntegerSchema,
    state: ActiveStateSchema,
    protocolEntries: v.array(StoredProtocolEntrySchema),
  }),
  FailureSchema,
])
export const CompletedMatchTransferSchema = v.object({
  matchId: MatchIdSchema,
  gameKey: RegisteredGameKeySchema,
  createdAt: UnixEpochMillisecondsSchema,
  sourceLatestSeq: PositiveIntegerSchema,
  endedAt: UnixEpochMillisecondsSchema,
  protocolEntries: NonEmptyStoredProtocolEntriesSchema,
  finalState: FinishedStateSchema,
})
const invalid: Failure = { ok: false, error: 'Invalid MatchRoom response', status: 502 }

function parse<T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: T,
  input: StructuredRpcResult,
): v.InferOutput<T> | Failure {
  const result = v.safeParse(schema, input)
  return result.success ? result.output : invalid
}

export function createMatchRoomClient(namespace: { getByName(name: string): MatchRoomStub }): MatchRoomClient {
  return {
    create: async (request: MatchRoomCreateRequest) => {
      const result = parse(
        v.variant('ok', [v.object({ ok: v.literal(true), matchId: MatchIdSchema }), FailureSchema]),
        await namespace.getByName(request.matchId).create(request),
      )
      return result.ok && result.matchId !== request.matchId ? invalid : result
    },
    readControl: async <K extends RegisteredGameKey>(matchId: MatchId, expectedGameKey: K) => {
      const result = parse(ControlResultSchema, await namespace.getByName(matchId).readControl({ matchId }))
      if (!result.ok) return result
      if (result.state.matchId !== matchId || result.state.gameKey !== expectedGameKey) return invalid
      try {
        const controlProjection = result.controlProjection
          ? parseGameControl(expectedGameKey, result.controlProjection)
          : undefined
        // SAFETY: the runtime game-key equality above correlates the parsed state with K.
        const state = result.state as MatchStateFor<K>
        return controlProjection === undefined
          ? { ok: true as const, latestSeq: result.latestSeq, state, controlSections: result.controlSections }
          : {
              ok: true as const,
              latestSeq: result.latestSeq,
              state,
              controlSections: result.controlSections,
              // SAFETY: parseGameControl parsed this projection using expectedGameKey K.
              controlProjection: controlProjection as ControlProjectionFor<K>,
            }
      } catch {
        return invalid
      }
    },
    readProtocol: async <K extends RegisteredGameKey>(matchId: MatchId, expectedGameKey: K) => {
      const result = parse(ProtocolResultSchema, await namespace.getByName(matchId).readProtocol({ matchId }))
      if (!result.ok) return result
      if (result.state.matchId !== matchId || result.state.gameKey !== expectedGameKey) return invalid
      // SAFETY: the runtime game-key equality above correlates the parsed state with K.
      return { ...result, state: result.state as MatchStateFor<K> }
    },
    submitCommand: async (matchId: MatchId, command: MatchCommand) => {
      const result = parse(
        v.variant('ok', [
          v.object({ ok: v.literal(true), outcome: OutcomeSchema, finalizing: v.optional(v.literal(true)) }),
          FailureSchema,
        ]),
        await namespace.getByName(matchId).submitCommand({ matchId, command }),
      )
      if (!result.ok || result.finalizing === undefined) return result.ok ? { ok: true, outcome: result.outcome } : result
      return { ok: true, outcome: result.outcome, finalizing: true }
    },
    stream: async (matchId: MatchId, since?: number) =>
      namespace.getByName(matchId).stream(since === undefined ? { matchId } : { matchId, since }),
    finalization: async (matchId: MatchId) => {
      const result = parse(
        v.variant('ok', [v.object({ ok: v.literal(true), data: CompletedMatchTransferSchema }), FailureSchema]),
        await namespace.getByName(matchId).finalization({ matchId }),
      )
      return result.ok && result.data.matchId !== matchId ? invalid : result
    },
    disposeFinalized: async (matchId: MatchId) =>
      parse(
        v.variant('ok', [v.object({ ok: v.literal(true) }), FailureSchema]),
        await namespace.getByName(matchId).disposeFinalized({ matchId }),
      ),
  }
}

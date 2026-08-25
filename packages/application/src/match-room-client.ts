import {
  type CreateMatchRequest,
  type MatchStateFor,
  SparringMatchRejectionSchema,
  type SparringMatchRoomProjection,
} from '@ks/competition'
import {
  AcceptedFactRefSchema,
  type CommandId,
  type ControlCommand,
  type ControlCommandSections,
  ControlCommandSectionsSchema,
  type MatchId,
  MatchIdSchema,
  MatchStateSchema,
  NonEmptyStringSchema,
  PositiveIntegerSchema,
  type StoredMatchFact,
  StoredMatchFactSchema,
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
export type MatchRoomFinalizationData = {
  sourceLatestSeq: number
  endedAt: UnixEpochMilliseconds
  facts: StoredMatchFact[]
  projection: SparringMatchRoomProjection
}
type MatchRoomFailure = { ok: false; error: string; status: number }
type MatchRoomCreateResult = { ok: true; matchId: MatchId } | MatchRoomFailure
type MatchRoomCommandResult =
  | { ok: true; outcome: CommandReceiptOutcome; finalizing?: true }
  | { ok: false; error: string; status: number }
type MatchRoomSnapshotSuccess = {
  [K in RegisteredGameKey]: {
    ok: true
    state: MatchStateFor<K>
    latestSeq: number
    controlProjection: ControlProjectionFor<K> | undefined
    controlSections: ControlCommandSections
  }
}[RegisteredGameKey]
export type MatchRoomSnapshotResult = MatchRoomSnapshotSuccess | ReadMatchFailure
type MatchRoomFinalizationResult = { ok: true; data: MatchRoomFinalizationData } | MatchRoomFailure
type StructuredRpcResult = {
  readonly ok?: unknown
  readonly matchId?: unknown
  readonly state?: unknown
  readonly latestSeq?: unknown
  readonly controlProjection?: unknown
  readonly controlSections?: unknown
  readonly outcome?: unknown
  readonly finalizing?: unknown
  readonly facts?: unknown
  readonly data?: unknown
  readonly error?: unknown
  readonly status?: unknown
}
type MatchRoomStub = {
  create(request: MatchRoomCreateRequest): Promise<StructuredRpcResult>
  snapshot(args: { matchId: MatchId }): Promise<StructuredRpcResult>
  submitCommand(args: { matchId: MatchId; commandId: CommandId; command: ControlCommand }): Promise<StructuredRpcResult>
  stream(args: { matchId: MatchId; since?: number }): Promise<Response>
  listFacts(args: { matchId: MatchId }): Promise<StructuredRpcResult>
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
const CreateResultSchema = v.variant('ok', [v.object({ ok: v.literal(true), matchId: MatchIdSchema }), FailureSchema])
const CommandOutcomeSchema = v.variant('_tag', [
  v.object({ _tag: v.literal('accepted'), accepted: v.pipe(v.array(AcceptedFactRefSchema), v.minLength(1)) }),
  v.object({ _tag: v.literal('rejected'), reason: SparringMatchRejectionSchema }),
])
const CommandResultSchema = v.variant('ok', [
  v.object({ ok: v.literal(true), outcome: CommandOutcomeSchema, finalizing: v.optional(v.literal(true)) }),
  FailureSchema,
])
const ControlProjectionInputSchema = v.object({
  gameKey: v.string(),
  projection: v.literal('control'),
  score: v.object({ A: v.number(), B: v.number() }),
  details: v.optional(v.unknown()),
})
const SnapshotResultSchema = v.variant('ok', [
  v.object({
    ok: v.literal(true),
    state: ActiveStateSchema,
    latestSeq: PositiveIntegerSchema,
    controlProjection: v.optional(ControlProjectionInputSchema),
    controlSections: ControlCommandSectionsSchema,
  }),
  FailureSchema,
])
const FactsResultSchema = v.variant('ok', [
  v.object({ ok: v.literal(true), facts: v.pipe(v.array(StoredMatchFactSchema), v.minLength(1)) }),
  FailureSchema,
])
const FinalizationResultSchema = v.variant('ok', [
  v.object({
    ok: v.literal(true),
    data: v.object({
      sourceLatestSeq: PositiveIntegerSchema,
      endedAt: UnixEpochMillisecondsSchema,
      facts: v.pipe(v.array(StoredMatchFactSchema), v.minLength(1)),
      projection: v.object({
        state: FinishedStateSchema,
        controlProjection: v.optional(ControlProjectionInputSchema),
        controlSections: ControlCommandSectionsSchema,
      }),
    }),
  }),
  FailureSchema,
])
const DisposeResultSchema = v.variant('ok', [v.object({ ok: v.literal(true) }), FailureSchema])
const invalidResponse: MatchRoomFailure = { ok: false, error: 'Invalid MatchRoom response', status: 502 }

function projectionExpected(state: v.InferOutput<typeof StateSchema>): boolean {
  const latestFrame = state.frames.at(-1)
  if (!latestFrame) {
    if (state.currentFrameIndex !== 0) throw new Error('Control projection lifecycle mismatch')
    return false
  }
  if (latestFrame.frameIndex !== state.currentFrameIndex) throw new Error('Control projection lifecycle mismatch')
  return state.status === 'active' && latestFrame.winnerSeat === undefined
}

function parseProjection(
  state: v.InferOutput<typeof StateSchema>,
  input: v.InferOutput<typeof ControlProjectionInputSchema> | undefined,
): ControlProjectionFor<RegisteredGameKey> | undefined {
  const present = input !== undefined
  if (present !== projectionExpected(state)) throw new Error('Control projection lifecycle mismatch')
  return input ? parseGameControl(state.gameKey, input) : undefined
}

function parseResult<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  input: StructuredRpcResult,
): v.InferOutput<TSchema> | MatchRoomFailure {
  const parsed = v.safeParse(schema, input)
  return parsed.success ? parsed.output : invalidResponse
}

export type MatchRoomClient = ReturnType<typeof createMatchRoomClient>

/**
 * Creates the application-side trust boundary for MatchRoom RPC.
 * Structured responses are parsed and cross-checked against each request; malformed representations become a stable 502
 * failure, while transport exceptions and opaque stream responses pass through unchanged.
 */
export function createMatchRoomClient(namespace: { getByName(name: string): MatchRoomStub }) {
  return {
    create: async (request: MatchRoomCreateRequest): Promise<MatchRoomCreateResult> => {
      const result = parseResult(CreateResultSchema, await namespace.getByName(request.matchId).create(request))
      return result.ok && result.matchId !== request.matchId ? invalidResponse : result
    },
    snapshot: async (matchId: MatchId): Promise<MatchRoomSnapshotResult> => {
      const result = parseResult(SnapshotResultSchema, await namespace.getByName(matchId).snapshot({ matchId }))
      if (!result.ok) return result
      if (result.state.matchId !== matchId) return invalidResponse
      try {
        const controlProjection = parseProjection(result.state, result.controlProjection)
        // SAFETY: StateSchema and parseGameControl correlate both values through the same registered game key.
        return { ...result, controlProjection } as MatchRoomSnapshotSuccess
      } catch {
        return invalidResponse
      }
    },
    submitCommand: async (matchId: MatchId, commandId: CommandId, command: ControlCommand): Promise<MatchRoomCommandResult> => {
      const result = parseResult(
        CommandResultSchema,
        await namespace.getByName(matchId).submitCommand({ matchId, commandId, command }),
      )
      if (!result.ok) return result
      if (result.finalizing) return { ok: true, outcome: result.outcome, finalizing: true }
      return { ok: true, outcome: result.outcome }
    },
    stream: async (matchId: MatchId, since?: number) =>
      since === undefined
        ? await namespace.getByName(matchId).stream({ matchId })
        : await namespace.getByName(matchId).stream({ matchId, since }),
    listFacts: async (matchId: MatchId) => {
      const result = parseResult(FactsResultSchema, await namespace.getByName(matchId).listFacts({ matchId }))
      if (result.ok && result.facts.some((fact) => fact.matchId !== matchId)) return invalidResponse
      return result
    },
    finalization: async (matchId: MatchId) => {
      const result = parseResult(FinalizationResultSchema, await namespace.getByName(matchId).finalization({ matchId }))
      if (!result.ok) return result
      if (result.data.projection.state.matchId !== matchId || result.data.facts.some((fact) => fact.matchId !== matchId))
        return invalidResponse
      try {
        const controlProjection = parseProjection(result.data.projection.state, result.data.projection.controlProjection)
        // SAFETY: StateSchema and parseGameControl correlate the finalization state and projection through one game key.
        const parsedFinalization = {
          ...result,
          data: {
            ...result.data,
            projection: { ...result.data.projection, controlProjection },
          },
        } as MatchRoomFinalizationResult
        return parsedFinalization
      } catch {
        return invalidResponse
      }
    },
    disposeFinalized: async (matchId: MatchId) =>
      parseResult(DisposeResultSchema, await namespace.getByName(matchId).disposeFinalized({ matchId })),
  }
}

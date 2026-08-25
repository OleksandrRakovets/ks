import { CreateMatchRequestSchema, type SparringMatchRoomProjection } from '@ks/competition'
import {
  type ControlCommand,
  MatchConfigSchema,
  MatchIdSchema,
  newCommandId,
  newMatchId,
  PlayerRefSchema,
  type StoredMatchFact,
  UnixEpochMillisecondsSchema,
} from '@ks/core'
import type { ControlCommandSections, MatchState } from '@ks/core'
import type { ControlProjectionFor, RegisteredGameKey } from '@ks/gameplay/definitions'
import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test'
import * as v from 'valibot'
import { describe, expect, test } from 'vitest'

import type { CreateBody, SubmitCommandResult } from './rpc-contract'

const controlSecret = 'control-secret-1234567890'
const createdAt = v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000)
const playerRefA = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')
const playerRefB = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB')

const baseRequest = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: playerRefA },
    { seat: 'B', playerRef: playerRefB },
  ],
})

const quickWinRequest = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 2, B: 2 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: playerRefA },
    { seat: 'B', playerRef: playerRefB },
  ],
})

function createBody(matchId: string, request = baseRequest): CreateBody {
  return {
    ...request,
    matchId: v.parse(MatchIdSchema, matchId),
    controlSecret,
    createdAt,
  }
}

function frameStartCommand(): ControlCommand {
  return { source: 'match', commandType: 'frame.start', command: {} }
}

function frameCommenceCommand(seat: 'A' | 'B'): ControlCommand {
  return { source: 'match', commandType: 'frame.commence', command: { seat } }
}

function frameConcedeCommand(seat: 'A' | 'B'): ControlCommand {
  return { source: 'match', commandType: 'frame.concede', command: { seat } }
}

function potRecordCommand(seat: 'A' | 'B', points: number): ControlCommand {
  return { source: 'game', commandType: 'pot.record', command: { seat, points } }
}

function frameAwardCommand(seat: 'A' | 'B'): ControlCommand {
  return { source: 'game', commandType: 'frame.award', command: { seat } }
}

type RoomSnapshotSuccessFor<K extends RegisteredGameKey> = {
  ok: true
  state: MatchState & { gameKey: K }
  latestSeq: number
  controlProjection: ControlProjectionFor<K> | undefined
  controlSections: ControlCommandSections
}

type RoomSnapshotSuccess = {
  [K in RegisteredGameKey]: RoomSnapshotSuccessFor<K>
}[RegisteredGameKey]

type ListFactsOk = { ok: true; facts: StoredMatchFact[] }
type SnapshotOk = RoomSnapshotSuccess
type SubmitCommandOk = Extract<SubmitCommandResult, { ok: true }>
type FinalizationOk = {
  ok: true
  data: {
    sourceLatestSeq: number
    endedAt: number
    facts: StoredMatchFact[]
    projection: SparringMatchRoomProjection
  }
}

async function evictMatchRoom(stub: ReturnType<typeof env.MATCH_ROOM.getByName>): Promise<void> {
  // SAFETY: vitest pool typings widen MATCH_ROOM stubs; this suite only evicts MatchRoom instances.
  await evictDurableObject(stub as Parameters<typeof evictDurableObject>[0])
}

async function readStreamBody(response: Response, timeoutMs = 400): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const result = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), remaining),
      ),
    ])
    if (result.done) break
    if (result.value) buffer += decoder.decode(result.value, { stream: true })
  }
  try {
    await reader.cancel()
  } catch {
    // The stream may already be closed.
  }
  return buffer
}

function assertOk<TOk extends { ok: true }>(result: { ok: boolean }): TOk {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Expected ok result')
  // SAFETY: expect(result.ok) and the guard above establish the success branch requested by TOk.
  return result as TOk
}

async function captureRpcError(operation: () => Promise<object>): Promise<Error> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error('Expected RPC to fail')
}

describe('MatchRoom integration', () => {
  test('creates a sole match.created fact idempotently and projects an initialized session', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    expect(await stub.create(createBody(matchId))).toEqual({ ok: true, matchId })
    expect(await stub.create(createBody(matchId))).toEqual({ ok: true, matchId })

    const facts = assertOk<ListFactsOk>(await stub.listFacts({ matchId }))
    expect(facts.facts).toEqual([expect.objectContaining({ seq: 1, type: 'match.created', causedByCommandId: null })])

    const snapshot = assertOk<SnapshotOk>(await stub.snapshot({ matchId }))
    expect(snapshot.state.currentFrameIndex).toBe(0)
    expect(snapshot.controlSections.neutral[0]?.commandType).toBe('frame.start')
  })

  test('accepts warm commands with shared causation and broadcasts non-terminal facts', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))

    const commandId = newCommandId()
    const streamResponse = await stub.stream({ matchId, since: 1 })
    const accepted = await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })
    const streamBody = await readStreamBody(streamResponse)

    expect(accepted).toEqual({
      ok: true,
      outcome: { _tag: 'accepted', accepted: [expect.objectContaining({ seq: 2 })] },
    })
    expect(streamBody).toContain('"type":"frame.started"')
    expect(streamBody).toContain('"seq":2')

    const facts = assertOk<ListFactsOk>(await stub.listFacts({ matchId }))
    expect(facts.facts[1]).toMatchObject({
      seq: 2,
      type: 'frame.started',
      causedByCommandId: commandId,
    })

    const retry = await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })
    expect(retry).toEqual(accepted)
  })

  test('stores rejected receipts without advancing sequence or writing facts', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })

    const commandId = newCommandId()
    const rejected = await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })
    expect(rejected.ok).toBe(true)
    if (!rejected.ok) throw new Error('Expected rejected receipt')
    expect(rejected.outcome._tag).toBe('rejected')

    const factsBefore = assertOk<ListFactsOk>(await stub.listFacts({ matchId }))
    const retry = await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })
    const factsAfter = assertOk<ListFactsOk>(await stub.listFacts({ matchId }))

    expect(retry).toEqual(rejected)
    expect(factsAfter.facts).toEqual(factsBefore.facts)
    expect(factsAfter.facts).toHaveLength(2)
  })

  test('returns command-id-conflict for reused IDs with different canonical commands', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))

    const commandId = newCommandId()
    await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })
    const conflict = await stub.submitCommand({
      matchId,
      commandId,
      command: frameConcedeCommand('B'),
    })

    expect(conflict).toEqual({ ok: false, error: 'command-id-conflict', status: 409 })
  })

  test('returns command-id-conflict when a rejected receipt is retried with a different command', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })

    const commandId = newCommandId()
    const rejected = await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })
    expect(rejected.ok).toBe(true)
    if (!rejected.ok) throw new Error('Expected rejected receipt')
    expect(rejected.outcome._tag).toBe('rejected')

    const conflict = await stub.submitCommand({ matchId, commandId, command: frameConcedeCommand('A') })
    expect(conflict).toEqual({ ok: false, error: 'command-id-conflict', status: 409 })
  })

  test('returns invalid-command-body without a receipt for malformed frame.start payload', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))

    const commandId = newCommandId()
    const malformed = { source: 'match', commandType: 'frame.start', command: { extra: true } } satisfies ControlCommand
    const result = await stub.submitCommand({ matchId, commandId, command: malformed })
    expect(result).toEqual({ ok: false, error: 'invalid-command-body', status: 400 })

    const retry = await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })
    expect(retry.ok).toBe(true)
  })

  test('returns invalid-command-body without a receipt for malformed game payloads', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameCommenceCommand('A') })

    const commandId = newCommandId()
    const malformed = { source: 'game', commandType: 'pot.record', command: {} } satisfies ControlCommand
    const result = await stub.submitCommand({ matchId, commandId, command: malformed })
    expect(result).toEqual({ ok: false, error: 'invalid-command-body', status: 400 })

    const retry = await stub.submitCommand({ matchId, commandId, command: potRecordCommand('A', 1) })
    expect(retry.ok).toBe(true)
  })

  test('returns a matching receipt before restoring a corrupt evicted resident', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    const commandId = newCommandId()
    const accepted = await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })

    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec('DELETE FROM accepted_facts WHERE seq = 1')
    })
    await evictMatchRoom(stub)

    expect(await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })).toEqual(accepted)
  })

  test('fails closed when retrying a locally corrupted persisted receipt', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    const commandId = newCommandId()
    await stub.submitCommand({ matchId, commandId, command: frameStartCommand() })

    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec('UPDATE command_receipts SET outcome_json = ? WHERE command_id = ?', '{}', commandId)
    })
    await evictMatchRoom(stub)

    const error = await captureRpcError(() => stub.submitCommand({ matchId, commandId, command: frameStartCommand() }))
    expect(error.message).toContain(`MatchRoom command_receipts storage corruption for command ${commandId}`)
  })

  test('reinstantiates resident state after eviction during an active frame and accepts gameplay', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameCommenceCommand('A') })

    await evictMatchRoom(stub)

    const accepted = assertOk<SubmitCommandOk>(
      await stub.submitCommand({
        matchId,
        commandId: newCommandId(),
        command: potRecordCommand('A', 1),
      }),
    )
    expect(accepted.outcome._tag).toBe('accepted')

    const snapshot = assertOk<SnapshotOk>(await stub.snapshot({ matchId }))
    expect(snapshot.controlProjection?.score).toEqual({ A: 1, B: 0 })
  })

  test('commits game.command, frame.completed, and match.ended atomically and locks new command IDs while finalizing', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId, quickWinRequest))
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameCommenceCommand('A') })
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: potRecordCommand('A', 2) })

    const terminalId = newCommandId()
    const terminal = await stub.submitCommand({ matchId, commandId: terminalId, command: frameAwardCommand('A') })
    expect(terminal).toEqual({
      ok: true,
      outcome: {
        _tag: 'accepted',
        accepted: [
          expect.objectContaining({ seq: 5 }),
          expect.objectContaining({ seq: 6 }),
          expect.objectContaining({ seq: 7 }),
        ],
      },
      finalizing: true,
    })

    const facts = assertOk<FinalizationOk>(await stub.finalization({ matchId }))
    expect(facts.data.facts.slice(-3).map((fact: StoredMatchFact) => fact.type)).toEqual([
      'game.command',
      'frame.completed',
      'match.ended',
    ])
    expect(facts.data.facts.slice(-3).every((fact: StoredMatchFact) => fact.causedByCommandId === terminalId)).toBe(true)

    const retry = await stub.submitCommand({ matchId, commandId: terminalId, command: frameAwardCommand('A') })
    expect(retry).toEqual(terminal)

    const locked = await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })
    expect(locked).toEqual({ ok: false, error: 'match-locked', status: 409 })
  })

  test('commits concession terminal batches and keeps them idempotent', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameCommenceCommand('A') })

    const terminalId = newCommandId()
    const terminal = await stub.submitCommand({ matchId, commandId: terminalId, command: frameConcedeCommand('A') })
    expect(terminal.ok).toBe(true)
    if (!terminal.ok) throw new Error('Expected terminal command')
    expect(terminal.finalizing).toBe(true)
    if (terminal.outcome._tag !== 'accepted') throw new Error('Expected accepted terminal command')
    expect(terminal.outcome.accepted.map((entry: { seq: number }) => entry.seq)).toEqual([4, 5])

    const facts = assertOk<FinalizationOk>(await stub.finalization({ matchId }))
    expect(facts.data.facts.slice(-2).map((fact: StoredMatchFact) => fact.type)).toEqual(['frame.completed', 'match.ended'])
  })

  test('returns terminal projection and complete journal from finalization', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameConcedeCommand('A') })

    const finalized = assertOk<FinalizationOk>(await stub.finalization({ matchId }))
    expect(finalized.data.sourceLatestSeq).toBe(4)
    expect(finalized.data.projection.state.status).toBe('finished')
    expect(finalized.data.facts.at(-1)?.type).toBe('match.ended')
  })

  test('broadcasts withheld match.ended on disposal and closes SSE streams', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameCommenceCommand('A') })

    const streamResponse = await stub.stream({ matchId, since: 1 })
    const terminalId = newCommandId()
    const terminal = await stub.submitCommand({ matchId, commandId: terminalId, command: frameConcedeCommand('A') })
    expect(terminal.ok).toBe(true)
    if (!terminal.ok) throw new Error('Expected terminal command')
    expect(terminal.finalizing).toBe(true)

    const reader = streamResponse.body!.getReader()
    const decoder = new TextDecoder()
    let body = ''
    const preDisposeDeadline = Date.now() + 500
    while (Date.now() < preDisposeDeadline) {
      const result = await Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) =>
          setTimeout(() => resolve({ done: false, value: new Uint8Array() }), 50),
        ),
      ])
      if (result.done) break
      if (result.value) body += decoder.decode(result.value, { stream: true })
      if (body.includes('"type":"frame.completed"')) break
    }
    expect(body).toContain('"type":"frame.completed"')
    expect(body).not.toContain('"type":"match.ended"')

    expect(await stub.disposeFinalized({ matchId })).toEqual({ ok: true })

    while (true) {
      const result = await reader.read()
      if (result.done) break
      if (result.value) body += decoder.decode(result.value, { stream: true })
    }
    expect(body).toContain('"type":"match.ended"')
    expect(await stub.disposeFinalized({ matchId })).toEqual({ ok: true })
    expect(await stub.listFacts({ matchId })).toEqual({ ok: false, error: 'Unknown match', status: 400 })
  })

  test('fails closed on an empty journal', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))

    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec('DELETE FROM accepted_facts')
    })
    await evictMatchRoom(stub)

    expect((await captureRpcError(() => stub.snapshot({ matchId }))).message).toContain('Active match journal is empty')
  })

  test('fails closed when the journal tail sequence does not match active latest_seq', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))

    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec('UPDATE active_matches SET latest_seq = 99')
    })
    await evictMatchRoom(stub)

    expect((await captureRpcError(() => stub.snapshot({ matchId }))).message).toContain(
      'Active match journal tail sequence mismatch',
    )
  })

  test.each([
    ['non-positive cursor', 'UPDATE active_matches SET latest_seq = 0'],
    ['invalid status', "UPDATE active_matches SET status = 'finished'"],
    ['invalid creation time', 'UPDATE active_matches SET created_at = -1'],
    ['invalid control secret', "UPDATE active_matches SET control_secret = 'short'"],
    ['malformed config JSON', "UPDATE active_matches SET config_json = '{'"],
  ])('fails closed on an active row with %s', async (_label, statement) => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))

    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(statement)
    })
    await evictMatchRoom(stub)

    expect((await captureRpcError(() => stub.snapshot({ matchId }))).message).toContain(
      'MatchRoom active_matches storage corruption',
    )
  })

  test('fails closed on a malformed active-row match ID', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec('DELETE FROM accepted_facts')
      state.storage.sql.exec("UPDATE active_matches SET match_id = 'bad'")
    })
    await evictMatchRoom(stub)
    expect((await captureRpcError(() => stub.snapshot({ matchId }))).message).toContain(
      'MatchRoom active_matches storage corruption',
    )
  })

  test('requires the active config to use a registered game key', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))

    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql.exec<{ config_json: string }>('SELECT config_json FROM active_matches').one()
      const config = v.parse(v.pipe(v.string(), v.parseJson(), MatchConfigSchema), row.config_json)
      state.storage.sql.exec(
        'UPDATE active_matches SET config_json = ?',
        JSON.stringify({ ...config, gameKey: 'historical-game' }),
      )
    })
    await evictMatchRoom(stub)
    expect((await captureRpcError(() => stub.snapshot({ matchId }))).message).toContain(
      'MatchRoom active_matches storage corruption',
    )
  })

  test('requires the creation fact to match the active config', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql.exec<{ config_json: string }>('SELECT config_json FROM active_matches').one()
      const config = v.parse(v.pipe(v.string(), v.parseJson(), MatchConfigSchema), row.config_json)
      state.storage.sql.exec('UPDATE active_matches SET config_json = ?', JSON.stringify({ ...config, firstBreakerSeat: 'B' }))
    })
    await evictMatchRoom(stub)
    expect((await captureRpcError(() => stub.snapshot({ matchId }))).message).toContain(
      'Active match journal creation does not match active config',
    )
  })

  test('requires the active row and config match IDs to agree', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql.exec<{ config_json: string }>('SELECT config_json FROM active_matches').one()
      const config = v.parse(v.pipe(v.string(), v.parseJson(), MatchConfigSchema), row.config_json)
      state.storage.sql.exec('UPDATE active_matches SET config_json = ?', JSON.stringify({ ...config, matchId: newMatchId() }))
    })
    await evictMatchRoom(stub)
    expect((await captureRpcError(() => stub.snapshot({ matchId }))).message).toContain(
      'MatchRoom active_matches storage corruption',
    )
  })

  test('MatchRoom storage adapter rejects internal journal sequence gaps', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(createBody(matchId))
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameStartCommand() })
    await stub.submitCommand({ matchId, commandId: newCommandId(), command: frameCommenceCommand('A') })

    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec('DELETE FROM accepted_facts WHERE seq = 2')
    })
    await evictMatchRoom(stub)

    expect((await captureRpcError(() => stub.snapshot({ matchId }))).message).toContain(
      'Active match journal envelope mismatch',
    )
  })
})

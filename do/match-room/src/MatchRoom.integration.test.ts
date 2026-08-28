import { CreateMatchRequestSchema } from '@ks/competition'
import { newCommandId, newMatchId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test'
import * as v from 'valibot'
import { describe, expect, test } from 'vitest'

import type { MatchRoom } from './MatchRoom'
import type { CreateBody } from './rpc-contract'

const controlSecret = 'control-secret-1234567890'
const request = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA') },
    { seat: 'B', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB') },
  ],
})

function body(matchId: ReturnType<typeof newMatchId>): CreateBody {
  return {
    ...request,
    matchId,
    controlSecret,
    createdAt: v.parse(UnixEpochMilliseconds, 1_700_000_000_000),
  }
}

describe('MatchRoom accepted command history', () => {
  test('requires routed identity and initializes idempotently without resident seeding', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    expect(await stub.create(body(matchId))).toEqual({ ok: true, matchId })
    expect(await stub.create(body(matchId))).toEqual({ ok: true, matchId })
    expect(await stub.readControl({ matchId })).toMatchObject({ ok: true, latestSeq: 0 })
    expect(await stub.finalization({ matchId })).toEqual({ ok: false, error: 'Match is active', status: 409 })
    expect(await stub.disposeFinalized({ matchId })).toEqual({
      ok: false,
      error: 'Match is active',
      status: 409,
    })

    const unnamed = env.MATCH_ROOM.get(env.MATCH_ROOM.newUniqueId())
    await runInDurableObject(unnamed, async (room) => {
      // SAFETY: The stub belongs to the MATCH_ROOM namespace, whose configured class is MatchRoom.
      const matchRoom = room as MatchRoom
      await expect(matchRoom.create(body(newMatchId()))).rejects.toThrow(
        'MatchRoom routed identity does not match initialization Match',
      )
    })
  })

  test('starts at sequence zero and restores canonical accepted commands after eviction', async () => {
    const matchId = newMatchId()
    let stub = env.MATCH_ROOM.getByName(matchId)
    expect(await stub.create(body(matchId))).toEqual({ ok: true, matchId })
    expect(await stub.readControl({ matchId })).toMatchObject({
      ok: true,
      latestSeq: 0,
      state: { currentFrameIndex: 0 },
    })

    const commandId = newCommandId()
    const command = { commandId, source: 'match' as const, command: { type: 'frame.prepare' } }
    const accepted = await stub.submitCommand({ matchId, command })
    expect(accepted).toEqual({ ok: true, outcome: { _tag: 'accepted', acceptedSeq: 1 } })
    expect(await stub.submitCommand({ matchId, command })).toEqual(accepted)

    const protocol = await stub.readProtocol({ matchId })
    expect(protocol).toMatchObject({
      ok: true,
      latestSeq: 1,
      protocolEntries: [
        { acceptedSeq: 1, entryIndex: 0, causedByCommandId: commandId, entryType: 'frame-prepared' },
      ],
    })

    await evictDurableObject(stub)
    stub = env.MATCH_ROOM.getByName(matchId)
    expect(await stub.submitCommand({ matchId, command })).toEqual(accepted)
    expect(await stub.readControl({ matchId })).toMatchObject({
      ok: true,
      latestSeq: 1,
      state: { currentFrameIndex: 1 },
    })
    expect(await stub.readProtocol({ matchId })).toMatchObject({
      ok: true,
      latestSeq: 1,
      protocolEntries: [{ causedByCommandId: commandId }],
    })
  })

  test('does not advance sequence for a durable rejected outcome', async () => {
    const matchId = newMatchId()
    let stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(body(matchId))
    const commandId = newCommandId()
    const command = {
      commandId,
      source: 'match' as const,
      command: { type: 'frame.concede', seat: 'A' as const },
    }
    const rejected = await stub.submitCommand({ matchId, command })
    expect(rejected).toMatchObject({ ok: true, outcome: { _tag: 'rejected' } })
    await evictDurableObject(stub)
    stub = env.MATCH_ROOM.getByName(matchId)
    expect(await stub.submitCommand({ matchId, command })).toEqual(rejected)
    expect(
      await stub.submitCommand({
        matchId,
        command: { ...command, command: { type: 'frame.prepare' } },
      }),
    ).toEqual({ ok: false, error: 'command-id-conflict', status: 409 })
    expect(await stub.readProtocol({ matchId })).toMatchObject({ ok: true, latestSeq: 0, protocolEntries: [] })
  })

  test('invalidates speculative resident state when accepted persistence fails', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(body(matchId))
    await stub.readControl({ matchId })
    const command = { commandId: newCommandId(), source: 'match' as const, command: { type: 'frame.prepare' } }

    await runInDurableObject(stub, async (room, state) => {
      // SAFETY: The stub belongs to the MATCH_ROOM namespace, whose configured class is MatchRoom.
      const matchRoom = room as MatchRoom
      state.storage.sql.exec(`
        CREATE TRIGGER fail_accepted_command
        BEFORE INSERT ON commands WHEN NEW.outcome = 'accepted'
        BEGIN SELECT RAISE(ABORT, 'forced persistence failure'); END
      `)
      await expect(matchRoom.submitCommand({ matchId, command })).rejects.toThrow()
      state.storage.sql.exec('DROP TRIGGER fail_accepted_command')
      expect(await matchRoom.submitCommand({ matchId, command })).toEqual({
        ok: true,
        outcome: { _tag: 'accepted', acceptedSeq: 1 },
      })
    })
  })

  test('orders replay before live delivery and releases cancelled streams', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(body(matchId))
    await stub.submitCommand({
      matchId,
      command: { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
    })

    const stream = await stub.stream({ matchId, since: 0 })
    const reader = stream.body!.getReader()
    const decoder = new TextDecoder()
    let received = ''
    while (!received.includes('"acceptedSeq":1') || !received.includes('"latestSeq":1'))
      received += decoder.decode((await reader.read()).value)
    expect(received.indexOf('"acceptedSeq":1')).toBeLessThan(received.indexOf('"latestSeq":1'))

    await stub.submitCommand({
      matchId,
      command: { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
    })
    while (!received.includes('"acceptedSeq":2')) received += decoder.decode((await reader.read()).value)
    await reader.cancel()
  })

  test('withholds terminal delivery from existing streams until disposal', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(body(matchId))
    await stub.submitCommand({
      matchId,
      command: { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
    })
    await stub.submitCommand({
      matchId,
      command: { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
    })
    const stream = await stub.stream({ matchId, since: 2 })
    const reader = stream.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"latestSeq":2')

    await stub.submitCommand({
      matchId,
      command: { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
    })
    await stub.disposeFinalized({ matchId })
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"terminal":true')
    expect((await reader.read()).done).toBe(true)
  })

  test('persists terminal transfer, withholds it live, and disposes without replay', async () => {
    const matchId = newMatchId()
    const otherMatchId = newMatchId()
    let stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(body(matchId))
    await stub.submitCommand({
      matchId,
      command: { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
    })
    await stub.submitCommand({
      matchId,
      command: { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
    })
    const terminalCommand = {
      commandId: newCommandId(),
      source: 'match' as const,
      command: { type: 'frame.concede', seat: 'B' },
    }
    const terminal = await stub.submitCommand({ matchId, command: terminalCommand })
    expect(terminal).toMatchObject({ ok: true, outcome: { acceptedSeq: 3 }, finalizing: true })
    expect(await stub.submitCommand({ matchId, command: terminalCommand })).toEqual(terminal)
    expect(
      await stub.submitCommand({
        matchId,
        command: { commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } },
      }),
    ).toEqual({ ok: false, error: 'match-locked', status: 409 })

    await evictDurableObject(stub)
    stub = env.MATCH_ROOM.getByName(matchId)
    const transfer = await stub.finalization({ matchId })
    expect(transfer).toMatchObject({
      ok: true,
      data: { matchId, sourceLatestSeq: 3, finalState: { status: 'finished' } },
    })
    expect(transfer).toHaveProperty('data.protocolEntries.0.acceptedSeq', 1)

    const stream = await stub.stream({ matchId, since: 2 })
    expect(stream.status).toBe(409)
    expect(await stream.json()).toEqual({ ok: false, error: 'Match is finalizing' })

    expect(await stub.disposeFinalized({ matchId })).toEqual({ ok: true })
    expect(await stub.disposeFinalized({ matchId })).toEqual({ ok: true })
    await evictDurableObject(stub)
    stub = env.MATCH_ROOM.getByName(matchId)
    expect(await stub.disposeFinalized({ matchId })).toEqual({ ok: true })
    expect(await stub.disposeFinalized({ matchId: otherMatchId })).toMatchObject({
      ok: false,
      error: 'Unknown match',
    })
  })
})

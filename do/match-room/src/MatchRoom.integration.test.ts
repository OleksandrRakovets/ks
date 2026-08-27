import { CreateMatchRequestSchema } from '@ks/competition'
import { newCommandId, newMatchId, PlayerRefSchema, UnixEpochMillisecondsSchema } from '@ks/core'
import { env, evictDurableObject } from 'cloudflare:test'
import * as v from 'valibot'
import { describe, expect, test } from 'vitest'

import type { CreateBody } from './rpc-contract'

const controlSecret = 'control-secret-1234567890'
const request = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA') },
    { seat: 'B', playerRef: v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB') },
  ],
})

function body(matchId: ReturnType<typeof newMatchId>): CreateBody {
  return { ...request, matchId, controlSecret, createdAt: v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000) }
}

describe('MatchRoom accepted command history', () => {
  test('starts at sequence zero and restores canonical accepted commands after eviction', async () => {
    const matchId = newMatchId()
    let stub = env.MATCH_ROOM.getByName(matchId)
    expect(await stub.create(body(matchId))).toEqual({ ok: true, matchId })
    expect(await stub.readControl({ matchId })).toMatchObject({ ok: true, latestSeq: 0, state: { currentFrameIndex: 0 } })

    const commandId = newCommandId()
    const command = { source: 'match' as const, commandType: 'frame.prepare', command: {} }
    const accepted = await stub.submitCommand({ matchId, commandId, command })
    expect(accepted).toEqual({ ok: true, outcome: { _tag: 'accepted', acceptedSeq: 1 } })
    expect(await stub.submitCommand({ matchId, commandId, command })).toEqual(accepted)

    const protocol = await stub.readProtocol({ matchId })
    expect(protocol).toMatchObject({
      ok: true,
      latestSeq: 1,
      protocolEntries: [{ acceptedSeq: 1, entryIndex: 0, causedByCommandId: commandId, entryType: 'frame-prepared' }],
    })

    await evictDurableObject(stub)
    stub = env.MATCH_ROOM.getByName(matchId)
    expect(await stub.readControl({ matchId })).toMatchObject({ ok: true, latestSeq: 1, state: { currentFrameIndex: 1 } })
  })

  test('does not advance sequence for a durable rejected outcome', async () => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(body(matchId))
    const commandId = newCommandId()
    const command = { source: 'match' as const, commandType: 'frame.concede', command: { seat: 'A' as const } }
    const rejected = await stub.submitCommand({ matchId, commandId, command })
    expect(rejected).toMatchObject({ ok: true, outcome: { _tag: 'rejected' } })
    expect(await stub.submitCommand({ matchId, commandId, command })).toEqual(rejected)
    expect(await stub.readProtocol({ matchId })).toMatchObject({ ok: true, latestSeq: 0, protocolEntries: [] })
  })

  test('persists terminal transfer, withholds it live, and disposes without replay', async () => {
    const matchId = newMatchId()
    let stub = env.MATCH_ROOM.getByName(matchId)
    await stub.create(body(matchId))
    await stub.submitCommand({
      matchId,
      commandId: newCommandId(),
      command: { source: 'match', commandType: 'frame.prepare', command: {} },
    })
    await stub.submitCommand({
      matchId,
      commandId: newCommandId(),
      command: { source: 'match', commandType: 'frame.commence', command: { seat: 'A' } },
    })
    const terminal = await stub.submitCommand({
      matchId,
      commandId: newCommandId(),
      command: { source: 'match', commandType: 'frame.concede', command: { seat: 'B' } },
    })
    expect(terminal).toMatchObject({ ok: true, outcome: { acceptedSeq: 3 }, finalizing: true })

    await evictDurableObject(stub)
    stub = env.MATCH_ROOM.getByName(matchId)
    const transfer = await stub.finalization({ matchId })
    expect(transfer).toMatchObject({ ok: true, data: { matchId, sourceLatestSeq: 3, finalState: { status: 'finished' } } })
    if (!transfer.ok) throw new Error('Expected finalization transfer')
    expect(transfer.data.protocolEntries[0]).toMatchObject({ acceptedSeq: 1 })

    const stream = await stub.stream({ matchId, since: 2 })
    const first = new TextDecoder().decode((await stream.body!.getReader().read()).value)
    expect(first).toContain('"latestSeq":2')
    expect(first).not.toContain('match-ended')

    expect(await stub.disposeFinalized({ matchId })).toEqual({ ok: true })
    expect(await stub.disposeFinalized({ matchId })).toEqual({ ok: true })
  })
})

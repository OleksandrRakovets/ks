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
    const command = { commandId, source: 'match' as const, command: { type: 'frame.prepare' } }
    const accepted = await stub.submitCommand({ matchId, command })
    expect(accepted).toEqual({ ok: true, outcome: { _tag: 'accepted', acceptedSeq: 1 } })
    expect(await stub.submitCommand({ matchId, command })).toEqual(accepted)

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
    const command = { commandId, source: 'match' as const, command: { type: 'frame.concede', seat: 'A' as const } }
    const rejected = await stub.submitCommand({ matchId, command })
    expect(rejected).toMatchObject({ ok: true, outcome: { _tag: 'rejected' } })
    expect(await stub.submitCommand({ matchId, command })).toEqual(rejected)
    expect(await stub.readProtocol({ matchId })).toMatchObject({ ok: true, latestSeq: 0, protocolEntries: [] })
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
    const terminal = await stub.submitCommand({
      matchId,
      command: { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
    })
    expect(terminal).toMatchObject({ ok: true, outcome: { acceptedSeq: 3 }, finalizing: true })

    await evictDurableObject(stub)
    stub = env.MATCH_ROOM.getByName(matchId)
    const transfer = await stub.finalization({ matchId })
    expect(transfer).toMatchObject({ ok: true, data: { matchId, sourceLatestSeq: 3, finalState: { status: 'finished' } } })
    expect(transfer).toHaveProperty('data.protocolEntries.0.acceptedSeq', 1)

    const stream = await stub.stream({ matchId, since: 2 })
    const first = new TextDecoder().decode((await stream.body!.getReader().read()).value)
    expect(first).toContain('"latestSeq":2')
    expect(first).not.toContain('match-ended')

    expect(await stub.disposeFinalized({ matchId })).toEqual({ ok: true })
    expect(await stub.disposeFinalized({ matchId })).toEqual({ ok: true })
    expect(await stub.disposeFinalized({ matchId: otherMatchId })).toMatchObject({ ok: false, error: 'Unknown match' })
  })
})

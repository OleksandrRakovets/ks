import { CreateMatchRequestSchema } from '@ks/competition'
import { newCommandId, newMatchId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { env, evictDurableObject } from 'cloudflare:test'
import * as v from 'valibot'
import { expect, test } from 'vitest'

import type { FinalizingTransfer } from './storage/match-storage'

const request = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA') },
    { seat: 'B', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB') },
  ],
})
const controlSecret = 'control-secret-1234567890'
const createdAt = v.parse(UnixEpochMilliseconds, 1_700_000_000_000)

function initialization(matchId: ReturnType<typeof newMatchId>) {
  return { ...request, matchId, controlSecret, createdAt }
}

test('initializes, restores, deduplicates, and finalizes through the trusted RPC surface', async () => {
  const matchId = newMatchId()
  let stub = env.MATCH_ROOM.getByName(matchId)
  expect(await stub.initialize(initialization(matchId))).toEqual({ _tag: 'initialized', matchId })
  expect(await stub.initialize(initialization(matchId))).toEqual({ _tag: 'initialized', matchId })
  expect(await stub.getControls()).toMatchObject({ _tag: 'active', latestSeq: 0 })

  const prepare = { commandId: newCommandId(), source: 'match' as const, command: { type: 'frame.prepare' } }
  const accepted = await stub.submitCommand(prepare)
  expect(accepted).toEqual({ _tag: 'accepted', acceptedSeq: 1, finalizesMatch: false })
  expect(await stub.submitCommand(prepare)).toEqual(accepted)
  await evictDurableObject(stub)
  stub = env.MATCH_ROOM.getByName(matchId)
  expect(await stub.getProtocol()).toMatchObject({ _tag: 'active', latestSeq: 1 })

  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  const terminalCommand = {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'frame.concede', seat: 'B' },
  }
  expect(await stub.submitCommand(terminalCommand)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 3,
    finalizesMatch: true,
  })
  expect(await stub.submitCommand(prepare)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 1,
    finalizesMatch: false,
  })
  expect(await stub.getControls()).toEqual({ _tag: 'finalizing' })
  const transfer: FinalizingTransfer = await stub.prepareArchive()
  expect(transfer.matchId).toBe(matchId)
  await expect(stub.dispose()).resolves.toBeUndefined()
  await expect(stub.dispose()).resolves.toBeUndefined()
})

test('withholds terminal stream delivery until disposal and rejects finalizing admission', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize(initialization(matchId))
  await stub.submitCommand({ commandId: newCommandId(), source: 'match', command: { type: 'frame.prepare' } })
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  const stream = await stub.stream(2)
  expect(stream._tag).toBe('active')
  if (stream._tag !== 'active') throw new Error('Expected active stream')
  const reader = stream.response.body!.getReader()
  await reader.read()
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.concede', seat: 'B' },
  })
  expect(await stub.stream()).toEqual({ _tag: 'finalizing' })
  await stub.dispose()
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"terminal":true')
})

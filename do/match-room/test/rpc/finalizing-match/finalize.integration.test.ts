import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { expect, test } from 'vitest'

import { captureRpcError, initializedRoom, makeRoomFinalizing } from '../fixtures'

test('throws before terminal acceptance', async () => {
  const { stub } = await initializedRoom()
  expect(
    (
      await captureRpcError(async () => {
        await stub.finalize()
      })
    ).message,
  ).toContain('active Match')
})

test('retains finalizing storage and schedules cleanup once across retries and eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  const finalizedAt = Date.now()
  await expect(stub.finalize()).resolves.toBeUndefined()
  const scheduledAt = await runInDurableObject(stub, (_room, state) => state.storage.getAlarm())
  if (scheduledAt === null) throw new Error('Expected cleanup alarm')
  expect(scheduledAt).toBeGreaterThanOrEqual(finalizedAt + 10 * 60 * 1000)
  expect(scheduledAt).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000)
  await expect(stub.prepareArchive()).resolves.toMatchObject({ matchId })
  await expect(stub.finalize()).resolves.toBeUndefined()
  expect(await runInDurableObject(stub, (_room, state) => state.storage.getAlarm())).toBe(scheduledAt)
  await evictDurableObject(stub)
  const revived = env.MATCH_ROOM.getByName(matchId)
  await expect(revived.finalize()).resolves.toBeUndefined()
  expect(await runInDurableObject(revived, (_room, state) => state.storage.getAlarm())).toBe(scheduledAt)
  await expect(revived.prepareArchive()).resolves.toMatchObject({ matchId })
})

test('does not replay commands after archive preparation', async () => {
  const { matchId, stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  await expect(stub.prepareArchive()).resolves.toMatchObject({ matchId })
  await runInDurableObject(stub, (_room, state) => {
    state.storage.sql.exec(`UPDATE commands SET request_json = '{}' WHERE accepted_seq = 1`)
  })
  await evictDurableObject(stub)

  await expect(env.MATCH_ROOM.getByName(matchId).finalize()).resolves.toBeUndefined()
})

test('alarm disposes retained storage and is idempotent', async () => {
  const { stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  await stub.finalize()
  await expect(runDurableObjectAlarm(stub)).resolves.toBe(true)
  await expect(runDurableObjectAlarm(stub)).resolves.toBe(false)
  await expect(stub.finalize()).resolves.toBeUndefined()
  await runInDurableObject(stub, async (_room, state) => {
    await expect(state.storage.getAlarm()).resolves.toBeNull()
    const tableNames = state.storage.sql
      .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .toArray()
      .map(({ name }) => name)
    expect(tableNames).not.toContain('active_matches')
    expect(tableNames).not.toContain('commands')
    expect(tableNames).not.toContain('protocol_entries')
  })
})

test('alarm rejects disposal of an active Match', async () => {
  const { stub } = await initializedRoom()
  await expect(
    runInDurableObject(stub, async (room) => {
      if (!room.alarm) throw new Error('Expected MatchRoom alarm handler')
      await room.alarm()
    }),
  ).rejects.toThrow('Cannot dispose active Match')
})

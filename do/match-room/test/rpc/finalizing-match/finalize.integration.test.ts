import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { expect, test } from 'vitest'

import { captureRpcError, initializedRoom, makeRoomFinalizing } from '../fixtures'

test('throws before a match-completing acceptance', async () => {
  const { stub } = await initializedRoom()
  expect(
    (
      await captureRpcError(async () => {
        await stub.finalize()
      })
    ).message,
  ).toContain('active Match')
})

test('retains finalizing storage across retries and eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  await expect(stub.finalize()).resolves.toBeUndefined()
  await expect(stub.prepareArchive()).resolves.toMatchObject({ matchId })
  await expect(stub.finalize()).resolves.toBeUndefined()
  await evictDurableObject(stub)
  const revived = env.MATCH_ROOM.getByName(matchId)
  await expect(revived.finalize()).resolves.toBeUndefined()
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

test('finalizing lightweight reads do not reconstruct corrupt command history', async () => {
  const { matchId, stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  await runInDurableObject(stub, (_room, state) => {
    state.storage.sql.exec(`UPDATE commands SET request_json = '{}' WHERE accepted_seq = 1`)
  })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)

  await expect(restored.getControls()).resolves.toEqual({ _tag: 'finalizing' })
  await expect(restored.getProtocol()).resolves.toEqual({ _tag: 'finalizing' })

  const response = await restored.fetch(
    new Request(`https://match-room/api/sparring-match/${matchId}/live/?contract=1&view=control`, {
      headers: { Upgrade: 'websocket' },
    }),
  )

  expect(response.status).toBe(410)
  await expect(
    captureRpcError(async () => {
      await restored.prepareArchive()
    }),
  ).resolves.toMatchObject({ message: expect.stringContaining('commands storage corruption') })
  await expect(restored.finalize()).resolves.toBeUndefined()
})

import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import type { MatchRoom } from '../../../src/MatchRoom'
import { captureRpcError, initializedRoom, makeRoomFinalizing } from '../fixtures'

type FinishedMatchTransfer = Awaited<ReturnType<MatchRoom['prepareArchive']>>

test('throws before a match-ending acceptance', async () => {
  const { stub } = await initializedRoom()
  expect(
    (
      await captureRpcError(async () => {
        await stub.prepareArchive()
      })
    ).message,
  ).toContain('active or discarded Match')
})

test('derives the same archive transfer across retries and eviction without replay', async () => {
  const { matchId, stub } = await initializedRoom()
  const endingCommand = await makeRoomFinalizing(stub)
  const warm: FinishedMatchTransfer = await stub.prepareArchive()
  await runInDurableObject(stub, (_room, state) => {
    state.storage.sql.exec(`UPDATE commands SET request_json = '{}' WHERE accepted_seq = 1`)
  })
  await evictDurableObject(stub)
  const restored: FinishedMatchTransfer = await env.MATCH_ROOM.getByName(matchId).prepareArchive()
  expect(restored.matchId).toBe(matchId)
  expect(restored.sourceLatestSeq).toBe(2)
  expect(restored.finalState.status).toBe('finished')
  expect(restored.finalState.winnerSeat).toBe('A')
  expect(await env.MATCH_ROOM.getByName(matchId).getScore()).toMatchObject({ score: { winnerSeat: 'A' } })
  const endingEntries = restored.protocolEntries.filter((entry) => entry.acceptedSeq === 2)
  expect(endingEntries).toHaveLength(3)
  expect(
    endingEntries.every(
      (entry) => entry.causedByCommandId === endingCommand.commandId && entry.acceptedAt === restored.endedAt,
    ),
  ).toBe(true)
  expect(endingEntries.map((entry) => entry.entryIndex)).toEqual([0, 1, 2])
  expect(restored).toEqual(warm)
})

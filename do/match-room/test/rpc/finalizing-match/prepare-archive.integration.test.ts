import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { expect, test } from 'vitest'

import type { MatchRoom } from '../../../src/MatchRoom'
import { captureRpcError, initializedRoom, makeRoomFinalizing } from '../fixtures'

type CompletedMatchTransfer = Awaited<ReturnType<MatchRoom['prepareArchive']>>

test('throws before terminal acceptance', async () => {
  const { stub } = await initializedRoom()
  expect(
    (
      await captureRpcError(async () => {
        await stub.prepareArchive()
      })
    ).message,
  ).toContain('active Match')
})

test('derives the same completion transfer after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  const terminalCommand = await makeRoomFinalizing(stub)
  const warm: CompletedMatchTransfer = await stub.prepareArchive()
  await evictDurableObject(stub)
  const restored: CompletedMatchTransfer = await env.MATCH_ROOM.getByName(matchId).prepareArchive()
  expect(restored.matchId).toBe(matchId)
  expect(restored.sourceLatestSeq).toBe(3)
  expect(restored.finalState.status).toBe('finished')
  const terminalEntries = restored.protocolEntries.filter((entry) => entry.acceptedSeq === 3)
  expect(terminalEntries).toHaveLength(3)
  expect(
    terminalEntries.every(
      (entry) =>
        entry.causedByCommandId === terminalCommand.commandId && entry.acceptedAt === restored.endedAt,
    ),
  ).toBe(true)
  expect(terminalEntries.map((entry) => entry.entryIndex)).toEqual([0, 1, 2])
  expect(restored).toEqual(warm)
})

test('rejects a schema-valid persisted final state that disagrees with replay', async () => {
  const { matchId, stub } = await initializedRoom()
  await makeRoomFinalizing(stub)
  await runInDurableObject(stub, (_room, state) => {
    const stored = state.storage.sql
      .exec<{ final_state_json: string }>('SELECT final_state_json FROM active_matches')
      .one().final_state_json
    const finalState = JSON.parse(stored)
    state.storage.sql.exec(
      'UPDATE active_matches SET final_state_json = ?',
      JSON.stringify({ ...finalState, framesWonBySeat: { A: 0, B: 1 } }),
    )
  })
  await evictDurableObject(stub)

  expect(
    (
      await captureRpcError(async () => {
        await env.MATCH_ROOM.getByName(matchId).prepareArchive()
      })
    ).message,
  ).toContain('final state does not match accepted history')
})

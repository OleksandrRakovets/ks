import { newCommandId, newMatchId } from '@ks/core'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'

import type { MatchRoom } from '../../../src/MatchRoom'
import { initialization } from '../fixtures'

type FinishedMatchTransfer = Awaited<ReturnType<MatchRoom['prepareArchive']>>

test.each([14, 15] as const)(
  'retains long-pyramid rack scores at rollover %i through eviction and archive',
  async (rollover) => {
    const matchId = newMatchId()
    const stub = env.MATCH_ROOM.getByName(matchId)
    await stub.initialize({
      ...initialization(matchId),
      gameKey: 'free-pyramid-long',
      targets: { frameTargetPointsBySeat: { A: 30, B: 30 }, matchTargetFrames: 1 },
      gameConfiguration: { rackRollover: rollover },
    })

    async function submit(
      source: 'match' | 'game',
      command: { type: string; seat?: 'A' | 'B'; pottedBallCount?: number },
    ) {
      const result = await stub.submitCommand({ commandId: newCommandId(), source, command })
      expect(result._tag).toBe('accepted')
    }

    await submit('match', { type: 'frame.prepare' })
    await submit('match', { type: 'frame.commence', seat: 'A' })

    for (const count of [4, 4, 4])
      await submit('game', { type: 'pot.record', seat: 'A', pottedBallCount: count })
    await submit('game', { type: 'pot.record', seat: 'B', pottedBallCount: rollover - 12 })

    await runInDurableObject(stub, (_room, state) => {
      expect(
        state.storage.sql
          .exec<{ game_result_json: string | null }>('SELECT game_result_json FROM active_matches')
          .one().game_result_json,
      ).toBeNull()
    })
    expect(await stub.getScore()).toMatchObject({ _tag: 'active', latestSeq: 6 })

    const racks = [
      { rackNumber: 1, scoreBySeat: { A: 12, B: rollover - 12 } },
      { rackNumber: 2, scoreBySeat: { A: 0, B: 0 } },
    ]

    await evictDurableObject(stub)
    const restored = env.MATCH_ROOM.getByName(matchId)
    expect(await restored.getControls()).toMatchObject({
      _tag: 'active',
      game: { details: { rackHistory: racks } },
    })

    await restored.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'frame.concede', seat: 'A' },
    })
    await evictDurableObject(restored)
    const finalizing = env.MATCH_ROOM.getByName(matchId)
    expect(await finalizing.getControls()).toMatchObject({
      _tag: 'finalizing',
      gameResult: { gameKey: 'free-pyramid-long', racks },
    })
    await runInDurableObject(finalizing, (_room, state) => {
      expect(
        state.storage.sql
          .exec<{ game_result_json: string | null }>('SELECT game_result_json FROM active_matches')
          .one().game_result_json,
      ).not.toBeNull()
    })
    const transfer: FinishedMatchTransfer = await finalizing.prepareArchive()
    expect(transfer.gameResult).toEqual({ gameKey: 'free-pyramid-long', racks })
  },
)

import { buildMatchConfig, CreateMatchRequestSchema } from '@ks/competition'
import { newCommandId, newMatchId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { env, runInDurableObject } from 'cloudflare:test'
import * as v from 'valibot'
import { expect, test } from 'vitest'

import { MatchStorage } from '../../src/storage/match-storage'

test('stores canonical values and compares durable Command retries semantically', async () => {
  const matchId = newMatchId()
  const config = buildMatchConfig(
    matchId,
    v.parse(CreateMatchRequestSchema, {
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
      firstBreakerSeat: 'A',
      participants: [
        { seat: 'A', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA') },
        { seat: 'B', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB') },
      ],
    }),
  )
  const commandId = newCommandId()
  const command = {
    commandId,
    source: 'game' as const,
    command: { type: 'shot', payload: { ball: 4, seat: 'A' } },
  }

  await runInDurableObject(env.MATCH_ROOM.getByName(matchId), (_room, state) => {
    const storage = new MatchStorage(state.storage)
    storage.migrate()
    storage.commitCreation({
      config,
      controlSecret: 'control-secret-1234567890',
      createdAt: v.parse(UnixEpochMilliseconds, 1_700_000_000_000),
    })
    storage.commitRejectedCommand({ matchId, command, reason: { code: 'no-active-frame' } })

    expect(storage.match()?.config).toEqual(config)
    expect(
      storage.findCommandReceipt({
        source: 'game',
        command: { payload: { seat: 'A', ball: 4 }, type: 'shot' },
        commandId,
      }),
    ).toEqual({ _tag: 'retry', receipt: { _tag: 'rejected', reason: { code: 'no-active-frame' } } })
    expect(
      storage.findCommandReceipt({
        ...command,
        command: { ...command.command, payload: { ball: 5, seat: 'A' } },
      }),
    ).toEqual({
      _tag: 'command-id-conflict',
    })
  })
})

import {
  buildMatchConfig,
  createMatch,
  CreateMatchRequest,
  projectMatchScore,
  restoreMatchCheckpoint,
} from '@ks/competition'
import { newCommandId, newMatchId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import * as v from 'valibot'
import { expect, test } from 'vitest'

import { MatchStorage } from '../../src/storage/match-storage'

const request = v.parse(CreateMatchRequest, {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA') },
    { seat: 'B', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB') },
  ],
})

const createdAt = v.parse(UnixEpochMilliseconds, 1_700_000_000_000)

const controlSecret = 'control-secret-1234567890'

test('stores validated values and compares durable Command retries semantically', async () => {
  const matchId = newMatchId()
  const config = buildMatchConfig(matchId, request)
  const commandId = newCommandId()

  const command = {
    commandId,
    source: 'game' as const,
    command: { type: 'shot', payload: { ball: 4, seat: 'A' } },
  }

  await runInDurableObject(env.MATCH_ROOM.getByName(matchId), (_room, state) => {
    const storage = new MatchStorage(state.storage)
    storage.migrate()
    expect(storage.optionalMatchRecord).toBeNull()
    const match = createMatch(config)
    storage.commitCreation({
      config,
      controlSecret,
      createdAt,
      checkpoint: match.exportCheckpoint(),
      score: projectMatchScore(match.state()),
    })
    storage.commitRejectedCommand({ command, reason: { code: 'no-active-frame' } })

    expect(storage.activeMatchRecord.config).toEqual(config)
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

test('SQLite rejects incomplete checkpoint predecessors and paired player references', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({ ...request, matchId, controlSecret, createdAt })

  await runInDurableObject(stub, (_room, state) => {
    const insert = (seq: number, predecessor: number | null, playerSeq: number | null, index: number | null) =>
      state.storage.sql.exec(
        `INSERT INTO checkpoints
          (seq, previous_checkpoint_seq, aggregate_json, last_player_accepted_seq, last_player_entry_index)
         VALUES (?, ?, '{}', ?, ?)`,
        seq,
        predecessor,
        playerSeq,
        index,
      )

    expect(
      state.storage.sql
        .exec<{ seq: number; previous_checkpoint_seq: number | null }>(
          'SELECT seq, previous_checkpoint_seq FROM checkpoints',
        )
        .one(),
    ).toEqual({ seq: 0, previous_checkpoint_seq: null })
    expect(() => insert(1, null, null, null)).toThrow()
    expect(() => insert(1, 0, 1, null)).toThrow()
    expect(() => insert(1, 0, null, 0)).toThrow()
    expect(() => insert(1, 1, null, null)).toThrow()
    expect(() => insert(1, 0, null, null)).not.toThrow()
    expect(() => insert(2, 1, 1, 0)).not.toThrow()
  })
})

test('reads complete durable Protocol independently of old command payloads', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({ ...request, matchId, controlSecret, createdAt })

  const commands = [
    {
      commandId: newCommandId(),
      source: 'match' as const,
      command: { type: 'frame.commence', seat: 'A' },
    },
    { commandId: newCommandId(), source: 'match' as const, command: { type: 'frame.concede', seat: 'B' } },
  ]

  for (const command of commands) await stub.submitCommand(command)

  await runInDurableObject(stub, (_room, state) => {
    const storage = new MatchStorage(state.storage)
    const matchRecord = storage.anyMatchRecord

    expect(matchRecord).toMatchObject({ latestSeq: 2 })
    expect(
      state.storage.sql
        .exec<{
          seq: number
          previous_checkpoint_seq: number | null
        }>('SELECT seq, previous_checkpoint_seq FROM checkpoints ORDER BY seq')
        .toArray(),
    ).toEqual([
      { seq: 0, previous_checkpoint_seq: null },
      { seq: 1, previous_checkpoint_seq: 0 },
      { seq: 2, previous_checkpoint_seq: 1 },
    ])

    expect(storage.readProtocol().map((entry) => entry.acceptedSeq)).toEqual([1, 2, 2, 2])
    expect(restoreMatchCheckpoint(storage.readCurrentCheckpoint()).state()).toMatchObject({
      status: 'finished',
      framesWonBySeat: { A: 1, B: 0 },
    })
    state.storage.sql.exec(
      `UPDATE commands SET request_json = ? WHERE accepted_seq = 1`,
      JSON.stringify({ ...commands[0], commandId: newCommandId() }),
    )
    expect(storage.readProtocol()[0]).toMatchObject({
      acceptedSeq: 1,
      causedByCommandId: commands[0]?.commandId,
    })
    const commenced = storage.readProtocol()[1]
    state.storage.sql.exec(
      `UPDATE protocol_entries SET entry_json = json_set(entry_json, '$.entryType', 'command-corrected')
       WHERE accepted_seq = 2 AND entry_index = 0`,
    )
    expect(() => storage.readProtocol()).toThrow('MatchRoom Protocol storage corruption')
    state.storage.sql.exec(
      'UPDATE protocol_entries SET entry_json = ? WHERE accepted_seq = 2 AND entry_index = 0',
      JSON.stringify(commenced),
    )
    state.storage.sql.exec(
      `UPDATE protocol_entries
       SET entry_json = json_set(entry_json, '$.body', json('{}'))
       WHERE accepted_seq = 1 AND entry_index = 0`,
    )
    expect(() => storage.readProtocol()).toThrow('MatchRoom Protocol storage corruption')
  })
})

test('rejects multiple Match rows as corrupt authority', async () => {
  const matchId = newMatchId()
  const otherMatchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({ ...request, matchId, controlSecret, createdAt })
  await runInDurableObject(stub, (_room, state) => {
    const otherConfig = buildMatchConfig(otherMatchId, request)
    state.storage.sql.exec(
      `INSERT INTO active_matches
        (match_id, control_secret, config_json, latest_seq, score_json, status, created_at, ended_at)
       VALUES (?, ?, ?, 0, ?, 'active', ?, NULL)`,
      otherMatchId,
      controlSecret,
      JSON.stringify(otherConfig),
      state.storage.sql.exec<{ score_json: string }>('SELECT score_json FROM active_matches').one().score_json,
      createdAt,
    )
    expect(() => new MatchStorage(state.storage).anyMatchRecord).toThrow('multiple Match rows')
  })
})

import { buildMatchConfig, createMatch, CreateMatchRequest } from '@ks/competition'
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

test('stores canonical values and compares durable Command retries semantically', async () => {
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
    const match = createMatch(config)
    storage.commitCreation({
      config,
      controlSecret,
      createdAt,
      checkpoint: match.exportCheckpoint(),
      presentation: match.project(),
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

test('SQLite rejects incomplete checkpoint predecessors and paired player references', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({ ...request, matchId, controlSecret, createdAt })

  await runInDurableObject(stub, (_room, state) => {
    const insert = (seq: number, predecessor: number | null, playerSeq: number | null, index: number | null) =>
      state.storage.sql.exec(
        `INSERT INTO checkpoints
          (seq, previous_checkpoint_seq, aggregate_json, state_json, game_presentation_json,
           last_player_accepted_seq, last_player_entry_index)
         VALUES (?, ?, '{}', '{}', NULL, ?, ?)`,
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
    { commandId: newCommandId(), source: 'match' as const, command: { type: 'frame.prepare' } },
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
    const match = storage.match()

    if (!match) throw new Error('Expected Match')

    expect(match).toMatchObject({ latestSeq: 3, currentCheckpointSeq: 3 })
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
      { seq: 3, previous_checkpoint_seq: 2 },
    ])

    expect(storage.readProtocol(match).map((entry) => entry.acceptedSeq)).toEqual([1, 2, 3, 3, 3])
    expect(storage.readCurrentState(match)).toMatchObject({
      status: 'finished',
      framesWonBySeat: { A: 1, B: 0 },
    })
    state.storage.sql.exec(
      `UPDATE commands SET request_json = ? WHERE accepted_seq = 1`,
      JSON.stringify({ ...commands[0], commandId: newCommandId() }),
    )
    expect(storage.readProtocol(match)[0]).toMatchObject({
      acceptedSeq: 1,
      causedByCommandId: commands[0]?.commandId,
    })
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
        (match_id, control_secret, config_json, latest_seq, current_checkpoint_seq, score_json, status, created_at, final_state_json, ended_at)
       VALUES (?, ?, ?, 0, 0, ?, 'active', ?, NULL, NULL)`,
      otherMatchId,
      controlSecret,
      JSON.stringify(otherConfig),
      state.storage.sql.exec<{ score_json: string }>('SELECT score_json FROM active_matches').one().score_json,
      createdAt,
    )
    expect(() => new MatchStorage(state.storage).match()).toThrow('multiple Match rows')
  })
})

test('rejects lifecycle corruption', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize({ ...request, matchId, controlSecret, createdAt })
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.prepare' },
  })
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.concede', seat: 'B' },
  })

  await runInDurableObject(stub, (_room, state) => {
    const storage = new MatchStorage(state.storage)

    const finalState = state.storage.sql
      .exec<{ final_state_json: string }>('SELECT final_state_json FROM active_matches')
      .one().final_state_json

    state.storage.sql.exec(
      `UPDATE active_matches SET final_state_json = ?`,
      JSON.stringify({ ...JSON.parse(finalState), status: 'active' }),
    )
    expect(() => storage.match()).toThrow('active_matches storage corruption')
  })
})

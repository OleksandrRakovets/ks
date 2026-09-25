import { MatchState, newCommandId, projectMatchScore } from '@ks/core'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import * as v from 'valibot'
import { expect, test } from 'vitest'

import {
  captureRpcError,
  commenceCommand,
  initializedRoom,
  matchEndingCommand,
  prepareCommand,
} from '../fixtures'

test('persists accepted and rejected outcomes and retries them after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  const rejected = commenceCommand()
  expect(await stub.submitCommand(rejected)).toEqual({ _tag: 'rejected', reason: { code: 'no-active-frame' } })
  const accepted = prepareCommand()
  expect(await stub.submitCommand(accepted)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 1,
    endsMatch: false,
  })
  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.submitCommand(rejected)).toEqual({
    _tag: 'rejected',
    reason: { code: 'no-active-frame' },
  })
  expect(await restored.submitCommand(accepted)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 1,
    endsMatch: false,
  })
})

test('detects Command ID conflicts', async () => {
  const { stub } = await initializedRoom()
  const commandId = newCommandId()

  const command = {
    commandId,
    source: 'match' as const,
    command: { type: 'frame.commence', seat: 'A' },
  }

  await stub.submitCommand(command)
  expect(await stub.submitCommand({ ...command, command: { ...command.command, seat: 'B' } })).toEqual({
    _tag: 'command-id-conflict',
  })
})

test('returns malformed nested Commands as data without poisoning the stub', async () => {
  const { stub } = await initializedRoom()
  expect(
    await stub.submitCommand({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'unsupported' },
    }),
  ).toEqual({ _tag: 'invalid-command' })
  expect(await stub.submitCommand(prepareCommand())).toEqual({
    _tag: 'accepted',
    acceptedSeq: 1,
    endsMatch: false,
  })
})

test('serializes concurrent Commands into one authoritative accepted order', async () => {
  const { stub } = await initializedRoom()

  const results = await Promise.all([
    stub.submitCommand(prepareCommand()),
    stub.submitCommand(prepareCommand()),
  ])

  expect(results).toContainEqual({ _tag: 'accepted', acceptedSeq: 1, endsMatch: false })
  expect(results).toContainEqual({ _tag: 'rejected', reason: { code: 'frame-already-active' } })
})

test('links a new checkpoint to an older current pointer without assuming the prior acceptance sequence', async () => {
  const { matchId, stub } = await initializedRoom()
  await stub.submitCommand(prepareCommand())
  await stub.submitCommand(commenceCommand())

  // This emulates the coherent pointer selection a future Correction would make while retaining its ledgers.
  await runInDurableObject(stub, (_room, state) => {
    const checkpoint = state.storage.sql
      .exec<{ state_json: string }>('SELECT state_json FROM checkpoints WHERE seq = 1')
      .one()

    const selectedState = v.parse(MatchState, JSON.parse(checkpoint.state_json))
    state.storage.sql.exec(
      'UPDATE active_matches SET current_checkpoint_seq = 1, score_json = ? WHERE match_id = ?',
      JSON.stringify(projectMatchScore(selectedState)),
      matchId,
    )
  })
  await evictDurableObject(stub)

  expect(await env.MATCH_ROOM.getByName(matchId).submitCommand(commenceCommand())).toEqual({
    _tag: 'accepted',
    acceptedSeq: 3,
    endsMatch: false,
  })
  await runInDurableObject(env.MATCH_ROOM.getByName(matchId), (_room, state) => {
    expect(
      state.storage.sql
        .exec<{ latest_seq: number; current_checkpoint_seq: number }>(
          'SELECT latest_seq, current_checkpoint_seq FROM active_matches',
        )
        .one(),
    ).toEqual({ latest_seq: 3, current_checkpoint_seq: 3 })
    expect(
      state.storage.sql
        .exec<{ seq: number; previous_checkpoint_seq: number }>(
          'SELECT seq, previous_checkpoint_seq FROM checkpoints WHERE seq = 3',
        )
        .one(),
    ).toEqual({ seq: 3, previous_checkpoint_seq: 1 })
    expect(
      state.storage.sql
        .exec<{ accepted_seq: number }>(
          'SELECT accepted_seq FROM commands WHERE accepted_seq IS NOT NULL ORDER BY accepted_seq',
        )
        .toArray(),
    ).toEqual([{ accepted_seq: 1 }, { accepted_seq: 2 }, { accepted_seq: 3 }])
  })
})

test('discards speculative resident state and rolls back both writes after persistence failure', async () => {
  const { stub } = await initializedRoom()
  await runInDurableObject(stub, (_room, state) => {
    state.storage.sql.exec(
      `CREATE TRIGGER fail_cursor BEFORE UPDATE ON active_matches BEGIN SELECT RAISE(FAIL, 'forced'); END`,
    )
  })
  await captureRpcError(async () => {
    await stub.submitCommand(prepareCommand())
  })
  await runInDurableObject(stub, (_room, state) => {
    expect(
      state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM commands').one().count,
    ).toBe(0)
    expect(
      state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM checkpoints').one().count,
    ).toBe(1)
    expect(
      state.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM protocol_entries').one().count,
    ).toBe(0)
    expect(
      state.storage.sql
        .exec<{ latest_seq: number; current_checkpoint_seq: number }>(
          'SELECT latest_seq, current_checkpoint_seq FROM active_matches',
        )
        .one(),
    ).toEqual({ latest_seq: 0, current_checkpoint_seq: 0 })
    state.storage.sql.exec('DROP TRIGGER fail_cursor')
  })
  expect(await stub.submitCommand(prepareCommand())).toEqual({
    _tag: 'accepted',
    acceptedSeq: 1,
    endsMatch: false,
  })
})

test('a match-ending retry still reports endsMatch while an earlier accepted retry does not', async () => {
  const { matchId, stub } = await initializedRoom()
  const rejected = commenceCommand()
  await stub.submitCommand(rejected)
  const earlier = prepareCommand()
  await stub.submitCommand(earlier)
  await stub.submitCommand(commenceCommand())
  const endingCommand = matchEndingCommand()
  expect(await stub.submitCommand(endingCommand)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 3,
    endsMatch: true,
  })
  expect(await stub.submitCommand(endingCommand)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 3,
    endsMatch: true,
  })
  expect(await stub.submitCommand(earlier)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 1,
    endsMatch: false,
  })
  expect(await stub.submitCommand(prepareCommand())).toEqual({ _tag: 'finalizing' })

  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.submitCommand(endingCommand)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 3,
    endsMatch: true,
  })
  expect(await restored.submitCommand(rejected)).toEqual({
    _tag: 'rejected',
    reason: { code: 'no-active-frame' },
  })
  expect(
    await restored.submitCommand({
      ...endingCommand,
      command: {
        ...endingCommand.command,
        seat: endingCommand.command.seat === 'A' ? 'B' : 'A',
      },
    }),
  ).toEqual({ _tag: 'command-id-conflict' })
  expect(await restored.submitCommand(prepareCommand())).toEqual({ _tag: 'finalizing' })
})

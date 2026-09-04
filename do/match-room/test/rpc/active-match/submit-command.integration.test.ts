import { newCommandId } from '@ks/core'
import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { expect, test } from 'vitest'

import {
  captureRpcError,
  commenceCommand,
  initializedRoom,
  prepareCommand,
  terminalCommand,
} from '../fixtures'

test('persists accepted and rejected outcomes and retries them after eviction', async () => {
  const { matchId, stub } = await initializedRoom()
  const rejected = commenceCommand()
  expect(await stub.submitCommand(rejected)).toEqual({ _tag: 'rejected', reason: { code: 'no-active-frame' } })
  const accepted = prepareCommand()
  expect(await stub.submitCommand(accepted)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 1,
    finalizesMatch: false,
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
    finalizesMatch: false,
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
    finalizesMatch: false,
  })
})

test('serializes concurrent Commands into one authoritative accepted order', async () => {
  const { stub } = await initializedRoom()
  const results = await Promise.all([
    stub.submitCommand(prepareCommand()),
    stub.submitCommand(prepareCommand()),
  ])
  expect(results).toContainEqual({ _tag: 'accepted', acceptedSeq: 1, finalizesMatch: false })
  expect(results).toContainEqual({ _tag: 'rejected', reason: { code: 'frame-already-active' } })
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
    state.storage.sql.exec('DROP TRIGGER fail_cursor')
  })
  expect(await stub.submitCommand(prepareCommand())).toEqual({
    _tag: 'accepted',
    acceptedSeq: 1,
    finalizesMatch: false,
  })
})

test('terminal retry remains terminal while an earlier accepted retry does not', async () => {
  const { matchId, stub } = await initializedRoom()
  const rejected = commenceCommand()
  await stub.submitCommand(rejected)
  const earlier = prepareCommand()
  await stub.submitCommand(earlier)
  await stub.submitCommand(commenceCommand())
  const terminal = terminalCommand()
  expect(await stub.submitCommand(terminal)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 3,
    finalizesMatch: true,
  })
  expect(await stub.submitCommand(terminal)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 3,
    finalizesMatch: true,
  })
  expect(await stub.submitCommand(earlier)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 1,
    finalizesMatch: false,
  })
  expect(await stub.submitCommand(prepareCommand())).toEqual({ _tag: 'finalizing' })

  await evictDurableObject(stub)
  const restored = env.MATCH_ROOM.getByName(matchId)
  expect(await restored.submitCommand(terminal)).toEqual({
    _tag: 'accepted',
    acceptedSeq: 3,
    finalizesMatch: true,
  })
  expect(await restored.submitCommand(rejected)).toEqual({
    _tag: 'rejected',
    reason: { code: 'no-active-frame' },
  })
  expect(
    await restored.submitCommand({
      ...terminal,
      command: { ...terminal.command, seat: terminal.command.seat === 'A' ? 'B' : 'A' },
    }),
  ).toEqual({ _tag: 'command-id-conflict' })
  expect(await restored.submitCommand(prepareCommand())).toEqual({ _tag: 'finalizing' })
})

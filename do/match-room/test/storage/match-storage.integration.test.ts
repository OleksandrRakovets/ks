import { buildMatchConfig, CreateMatchRequestSchema } from '@ks/competition'
import { newCommandId, newMatchId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { env, runInDurableObject } from 'cloudflare:test'
import * as v from 'valibot'
import { expect, test } from 'vitest'

import { MatchStorage } from '../../src/storage/match-storage'

const request = v.parse(CreateMatchRequestSchema, {
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
    storage.commitCreation({
      config,
      controlSecret,
      createdAt,
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

test('reconstructs typed history, Protocol, and the finalizing transfer from its authoritative cursor', async () => {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.create({ ...request, matchId, controlSecret, createdAt })
  const commands = [
    { commandId: newCommandId(), source: 'match' as const, command: { type: 'frame.prepare' } },
    {
      commandId: newCommandId(),
      source: 'match' as const,
      command: { type: 'frame.commence', seat: 'A' },
    },
    { commandId: newCommandId(), source: 'match' as const, command: { type: 'frame.concede', seat: 'B' } },
  ]
  for (const command of commands) await stub.submitCommand({ matchId, command })

  await runInDurableObject(stub, (_room, state) => {
    const storage = new MatchStorage(state.storage)
    expect(storage.readAcceptedCommandHistory().map((entry) => entry.command)).toEqual(commands)
    const protocol = storage.readProtocol()
    expect(protocol.latestSeq).toBe(3)
    expect([...new Set(protocol.protocolEntries.map((entry) => entry.acceptedSeq))]).toEqual([1, 2, 3])
    expect(
      protocol.protocolEntries.every(
        (entry) => entry.causedByCommandId === commands[entry.acceptedSeq - 1]!.commandId,
      ),
    ).toBe(true)
    expect(protocol.protocolEntries.at(-1)?.entryType).toBe('match-ended')
    expect(storage.readFinalizingTransfer()).toMatchObject({
      matchId,
      sourceLatestSeq: 3,
      finalState: { status: 'finished' },
    })

    state.storage.sql.exec(`UPDATE protocol_entries SET body_json = 'not-json' WHERE accepted_seq = 1`)
    expect(() => storage.readProtocol()).toThrow('MatchRoom protocol_entries storage corruption')
  })
})

import { newCommandId } from '@ks/core'
import { expect, test } from 'vitest'

import {
  initializedRoom,
  makeRoomFinalizing,
  matchCompletingCommand,
  prepareCommand,
  readEvent,
} from '../fixtures'

test('replays accepted sequences before ready and broadcasts non-finalizing acceptance to every client', async () => {
  const { stub } = await initializedRoom()
  await stub.submitCommand(prepareCommand())
  const first = await stub.stream(0)
  const second = await stub.stream(1)
  if (first._tag !== 'active' || second._tag !== 'active') throw new Error('Expected active streams')
  const firstReader = first.response.body!.getReader()
  const secondReader = second.response.body!.getReader()
  const replay = await readEvent(firstReader)
  expect(replay).toContain('"acceptedSeq":1')
  expect(replay).toContain('event: ready')
  expect(replay.indexOf('"acceptedSeq":1')).toBeLessThan(replay.indexOf('event: ready'))
  expect(await readEvent(secondReader)).toContain('event: ready')
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  expect(await readEvent(firstReader)).toContain('"acceptedSeq":2')
  expect(await readEvent(secondReader)).toContain('"acceptedSeq":2')
  await firstReader.cancel()
  await secondReader.cancel()
})

test('withholds match-completing delivery, rejects new admission, then delivers and closes during finalization', async () => {
  const { stub } = await initializedRoom()
  await stub.submitCommand(prepareCommand())
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  const stream = await stub.stream(2)
  if (stream._tag !== 'active') throw new Error('Expected active stream')
  const reader = stream.response.body!.getReader()
  await readEvent(reader)
  await stub.submitCommand(matchCompletingCommand())
  expect(await stub.stream()).toEqual({ _tag: 'finalizing' })
  await stub.finalize()
  expect(await readEvent(reader)).toContain('"completesMatch":true')
  expect((await reader.read()).done).toBe(true)
})

test('cancellation is harmless before later broadcast and finalization', async () => {
  const { stub } = await initializedRoom()
  const stream = await stub.stream()
  if (stream._tag !== 'active') throw new Error('Expected active stream')
  const reader = stream.response.body!.getReader()
  await readEvent(reader)
  await reader.cancel()
  await makeRoomFinalizing(stub)
  await expect(stub.finalize()).resolves.toBeUndefined()
})

test('concurrent stream admission and acceptance delivers the sequence exactly once', async () => {
  const { stub } = await initializedRoom()
  const [stream] = await Promise.all([stub.stream(0), stub.submitCommand(prepareCommand())])
  if (stream._tag !== 'active') throw new Error('Expected active stream')
  const reader = stream.response.body!.getReader()
  let text = await readEvent(reader)
  while (!text.includes('"acceptedSeq":1')) text += await readEvent(reader)
  expect(text.match(/"acceptedSeq":1/g)).toHaveLength(1)
  await reader.cancel()
})

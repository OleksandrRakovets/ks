import { newCommandId, newMatchId, SparringMatchLiveServerMessage } from '@ks/core'
import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { Schema } from 'effect'
import { expect, test } from 'vitest'

import { LiveConnectionHandler } from '../../../src/live/live-connection-handler'
import { initializedRoom, makeRoomFinalizing, matchEndingCommand } from '../fixtures'

function liveRequest(matchId: string, view: 'control' | 'protocol' = 'control'): Request {
  return new Request(`https://match-room/api/sparring-match/${matchId}/live/?contract=1&view=${view}`, {
    headers: { Upgrade: 'websocket' },
  })
}

async function connect(stub: Awaited<ReturnType<typeof initializedRoom>>['stub'], matchId: string) {
  const response = await stub.fetch(liveRequest(matchId))
  expect(response.status).toBe(101)
  const socket = response.webSocket

  if (!socket) throw new Error('Expected WebSocket')
  socket.accept()

  return socket
}

function nextMessage(socket: WebSocket): Promise<typeof SparringMatchLiveServerMessage.Type> {
  return new Promise((resolve) =>
    socket.addEventListener(
      'message',
      (event) =>
        resolve(Schema.decodeUnknownSync(Schema.fromJsonString(SparringMatchLiveServerMessage))(event.data)),
      { once: true },
    ),
  )
}

test('rejects a routed identity mismatch before reading MatchRoom storage', async () => {
  const stub = env.MATCH_ROOM.getByName(newMatchId())
  expect((await stub.fetch(liveRequest(newMatchId()))).status).toBe(400)
})

test('sends one catch-up cursor and broadcasts acceptances that do not end the Match', async () => {
  const { matchId, stub } = await initializedRoom()
  const first = await connect(stub, matchId)
  expect(await nextMessage(first)).toEqual({
    contractVersion: 1,
    type: 'caught-up',
    matchId,
    latestSeq: 0,
  })
  const live = nextMessage(first)
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  expect(await live).toMatchObject({
    contractVersion: 1,
    type: 'update',
    update: { acceptedSeq: 1, endsMatch: false },
  })
  first.close()
})

test('broadcasts and closes on the durable match-ending command before archive preparation', async () => {
  const { matchId, stub } = await initializedRoom()
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  const socket = await connect(stub, matchId)
  await nextMessage(socket)
  const endingUpdate = nextMessage(socket)

  const closed = new Promise<CloseEvent>((resolve) => {
    socket.addEventListener('close', (event) => resolve(event), { once: true })
  })

  await stub.submitCommand(matchEndingCommand())
  expect(await endingUpdate).toMatchObject({
    type: 'update',
    update: { acceptedSeq: 2, endsMatch: true },
  })
  expect((await closed).code).toBe(4000)
  expect((await stub.fetch(liveRequest(matchId))).status).toBe(410)
})

test('client closure is harmless before match end', async () => {
  const { matchId, stub } = await initializedRoom()
  const socket = await connect(stub, matchId)
  await nextMessage(socket)
  socket.close()
  await makeRoomFinalizing(stub)
  expect((await stub.fetch(liveRequest(matchId))).status).toBe(410)
})

test('rejects excess and invalid fields in restored hibernation attachments', async () => {
  const { matchId, stub } = await initializedRoom()
  const client = await connect(stub, matchId)
  await nextMessage(client)

  await runInDurableObject(stub, (_room, state) => {
    const socket = state.getWebSockets()[0]

    if (!socket) throw new Error('Expected accepted socket')

    const attachment = {
      contractVersion: 1,
      connectionId: '01234567-89ab-cdef-0123-456789abcdef',
      pageKind: 'control',
    }

    const handler = new LiveConnectionHandler(state)
    socket.serializeAttachment(attachment)
    expect(() => handler.recordClose(socket, 1000, '', true)).not.toThrow()

    for (const invalid of [
      { ...attachment, extra: true },
      { ...attachment, connectionId: 'invalid-uuid' },
      { ...attachment, contractVersion: 2 },
      { ...attachment, pageKind: 'unknown' },
    ]) {
      socket.serializeAttachment(invalid)
      expect(() => handler.recordClose(socket, 1000, '', true)).toThrow()
    }

    socket.serializeAttachment(attachment)
  })
  client.close()
})

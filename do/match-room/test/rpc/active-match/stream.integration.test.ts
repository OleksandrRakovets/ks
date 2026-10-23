import { newCommandId, newMatchId, SparringMatchLiveServerMessage } from '@ks/core'
import { env } from 'cloudflare:workers'
import * as v from 'valibot'
import { expect, test } from 'vitest'

import { commenceCommand, initializedRoom, matchEndingCommand } from '../fixtures'

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

/** Collects every message until the room closes the socket, preserving their order relative to the close. */
function messagesUntilClose(
  socket: WebSocket,
): Promise<{ messages: SparringMatchLiveServerMessage[]; close: CloseEvent }> {
  const messages: SparringMatchLiveServerMessage[] = []
  socket.addEventListener('message', (event) => {
    messages.push(v.parse(v.pipe(v.string(), v.parseJson(), SparringMatchLiveServerMessage), event.data))
  })

  return new Promise((resolve) =>
    socket.addEventListener('close', (close) => resolve({ messages, close }), { once: true }),
  )
}

function nextMessage(socket: WebSocket): Promise<SparringMatchLiveServerMessage> {
  return new Promise((resolve) =>
    socket.addEventListener(
      'message',
      (event) =>
        resolve(v.parse(v.pipe(v.string(), v.parseJson(), SparringMatchLiveServerMessage), event.data)),
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
  expect(await live).toEqual({
    contractVersion: 1,
    type: 'update',
    update: { type: 'command-accepted', acceptedSeq: 1 },
  })
  first.close()
})

test('broadcasts the match-ending acceptance, then live-ended, then closes before archive preparation', async () => {
  const { matchId, stub } = await initializedRoom()
  await stub.submitCommand({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  const socket = await connect(stub, matchId)
  await nextMessage(socket)
  const ending = messagesUntilClose(socket)

  await stub.submitCommand(matchEndingCommand())
  const { messages, close } = await ending
  expect(messages).toEqual([
    { contractVersion: 1, type: 'update', update: { type: 'command-accepted', acceptedSeq: 2 } },
    { contractVersion: 1, type: 'live-ended' },
  ])
  expect(close.code).toBe(4000)
  expect((await stub.fetch(liveRequest(matchId))).status).toBe(410)
})

test('a client-closed socket does not stop fan-out to another socket or match finalization', async () => {
  const { matchId, stub } = await initializedRoom()
  const closing = await connect(stub, matchId)
  await nextMessage(closing)
  const open = await connect(stub, matchId)
  await nextMessage(open)
  closing.close()

  const live = nextMessage(open)
  expect(await stub.submitCommand(commenceCommand())).toMatchObject({ _tag: 'accepted', acceptedSeq: 1 })
  expect(await live).toEqual({
    contractVersion: 1,
    type: 'update',
    update: { type: 'command-accepted', acceptedSeq: 1 },
  })

  const ending = messagesUntilClose(open)
  expect(await stub.submitCommand(matchEndingCommand())).toMatchObject({ _tag: 'accepted', endsMatch: true })
  expect((await ending).close.code).toBe(4000)
  expect((await stub.fetch(liveRequest(matchId))).status).toBe(410)
})

test('discard sends only live-ended before closing and rejects new connections', async () => {
  const { matchId, stub } = await initializedRoom()
  const socket = await connect(stub, matchId)
  await nextMessage(socket)
  const ending = messagesUntilClose(socket)

  await stub.discard()
  const { messages, close } = await ending
  expect(messages).toEqual([{ contractVersion: 1, type: 'live-ended' }])
  expect(close).toMatchObject({ code: 4000, reason: 'live-ended' })
  expect((await stub.fetch(liveRequest(matchId))).status).toBe(404)
})

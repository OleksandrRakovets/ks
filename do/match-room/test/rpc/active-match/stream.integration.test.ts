import { newCommandId, newMatchId, SparringMatchLiveServerMessage } from '@ks/core'
import { env } from 'cloudflare:workers'
import * as v from 'valibot'
import { expect, test } from 'vitest'

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

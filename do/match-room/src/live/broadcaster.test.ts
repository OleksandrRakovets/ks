import { expect, test } from 'bun:test'

import { StoredMatchFactSchema } from '@ks/core'
import * as v from 'valibot'

import { Broadcaster } from './broadcaster'

test('broadcasts the terminal fact before closing every stream', async () => {
  const broadcaster = new Broadcaster()
  const responseA = broadcaster.stream(2, [])
  const responseB = broadcaster.stream(2, [])
  const readerA = responseA.body!.getReader()
  const readerB = responseB.body!.getReader()
  await readerA.read()
  await readerB.read()

  broadcaster.broadcast(
    v.parse(StoredMatchFactSchema, {
      seq: 3,
      factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC',
      matchId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      acceptedAt: 1_700_000_000_001,
      causedByCommandId: '01ARZ3NDEKTSV4RRFFQ69G5FAD',
      type: 'match.ended',
      payload: { winnerSeat: 'A' },
    }),
  )
  broadcaster.closeAll()

  const terminalA = new TextDecoder().decode((await readerA.read()).value)
  const terminalB = new TextDecoder().decode((await readerB.read()).value)
  expect(terminalA).toContain('match.ended')
  expect(terminalB).toContain('match.ended')
  expect(await readerA.read()).toEqual({ value: undefined, done: true })
  expect(await readerB.read()).toEqual({ value: undefined, done: true })
})

import { expect, test } from 'bun:test'

import { type AcceptedCommandStreamUpdate, newCommandId, nowUnixEpochMilliseconds } from '@ks/core'

import { Broadcaster } from './broadcaster'

test('replays atomic command updates before ready', async () => {
  const update: AcceptedCommandStreamUpdate = {
    type: 'command-accepted',
    acceptedSeq: 1,
    terminal: false,
    entries: [
      {
        acceptedSeq: 1,
        entryIndex: 0,
        causedByCommandId: newCommandId(),
        acceptedAt: nowUnixEpochMilliseconds(),
        gameKey: 'strila-v2',
        frameIndex: 1,
        source: 'system',
        entryType: 'frame-prepared',
        seat: 'A',
        body: {},
      },
    ],
  }
  const response = new Broadcaster().stream(1, [update])
  const reader = response.body!.getReader()
  const text = new TextDecoder().decode((await reader.read()).value)
  await reader.cancel()
  expect(text).toContain('"acceptedSeq":1')
})

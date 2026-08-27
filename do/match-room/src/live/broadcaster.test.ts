import { expect, test } from 'bun:test'

import type { MatchStreamUpdate } from '@ks/core'

import { Broadcaster } from './broadcaster'

test('replays atomic command updates before ready', async () => {
  const update: MatchStreamUpdate = {
    type: 'command-accepted',
    acceptedSeq: 1,
    terminal: false,
  }
  const response = new Broadcaster().stream(1, [update])
  const reader = response.body!.getReader()
  const text = new TextDecoder().decode((await reader.read()).value)
  await reader.cancel()
  expect(text).toContain('"acceptedSeq":1')
})

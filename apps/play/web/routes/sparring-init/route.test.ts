import { expect, test } from 'bun:test'

import { RouterContextProvider } from 'react-router'

import { action } from './route'

test('match setup rejects a cleared frame target instead of restoring its default', async () => {
  const form = new FormData()
  form.set('seatAName', 'Alice')
  form.set('seatBName', 'Bob')
  form.set('matchTargetFrames', '3')
  form.set('targetA', '')
  form.set('targetB', '8')
  form.set('firstBreakerSeat', 'A')

  try {
    await action({
      params: { gameKey: 'strila-v2' },
      request: new Request('http://localhost', { method: 'POST', body: form }),
      context: new RouterContextProvider(),
    })
    throw new Error('Expected invalid match setup')
  } catch (error) {
    expect(error).toBeInstanceOf(Response)

    if (!(error instanceof Response)) throw error

    expect(error.status).toBe(400)
  }
})

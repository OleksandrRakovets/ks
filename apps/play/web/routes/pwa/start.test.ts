import { describe, expect, test } from 'bun:test'

import { loader } from './start'

describe('installed app launch', () => {
  test('redirects to the saved URL without caching a user-specific destination', () => {
    const response = loader({
      request: new Request('https://play.ks.ua/start/', {
        headers: { Cookie: 'ks.theme=auto; ks.lastUrl=%2Fen%2Fsparring%2F%3Fview%3Dgames%23rules' },
      }),
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/en/sparring/?view=games#rules')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  test('opens home on first launch', () => {
    const response = loader({ request: new Request('https://play.ks.ua/start/') })

    expect(response.headers.get('Location')).toBe('/')
  })
})

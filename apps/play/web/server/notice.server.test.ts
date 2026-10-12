import { expect, test } from 'bun:test'

import { consumeNotice } from './notice.server'

function requestWithCookie(cookie?: string) {
  return new Request('http://localhost/sparring/', cookie === undefined ? {} : { headers: { cookie } })
}

test('a pending notice is shown once and an unrecognized value is cleared without copy', () => {
  const known = consumeNotice(requestWithCookie('ks.theme=club-dark; ks.notice=match-discarded'))
  const unknown = consumeNotice(requestWithCookie('ks.notice=<script>'))

  expect(known.notice).toBe('match-discarded')
  expect(unknown.notice).toBeNull()

  for (const { headers } of [known, unknown])
    expect(headers.get('Set-Cookie')).toContain('ks.notice=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0')
})

test('pages without a pending notice do not write cookies', () => {
  for (const pending of [
    consumeNotice(requestWithCookie('ks.theme=club-dark')),
    consumeNotice(requestWithCookie()),
  ]) {
    expect(pending.notice).toBeNull()
    expect(pending.headers.has('Set-Cookie')).toBe(false)
  }
})

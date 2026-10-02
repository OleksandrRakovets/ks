import { expect, test } from 'bun:test'

import { action } from './ui-preferences'

test.each([
  ['club-light', 'club-light'],
  ['auto', 'auto'],
  ['unexpected', 'club-dark'],
  [null, 'club-dark'],
  [new File(['auto'], 'theme.txt'), 'club-dark'],
] as const)('theme preference %s preserves the cookie contract', async (value, expected) => {
  const form = new FormData()

  if (value !== null) form.set('theme', value)

  const result = await action({ request: new Request('http://localhost', { method: 'POST', body: form }) })
  expect(result.data).toEqual({ ok: true })
  expect(new Headers(result.init?.headers).get('Set-Cookie')).toBe(
    `ks.theme=${expected}; Path=/; SameSite=Lax; Max-Age=31536000`,
  )
})

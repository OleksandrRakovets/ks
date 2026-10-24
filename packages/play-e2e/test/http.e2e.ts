import { expect, listPath, test } from './browser'

// Plain HTTP against the built Worker: no page is needed to prove response cache policy.
test('successful HTML and Router data are no-store while built CSS is not no-store', async ({ request }) => {
  const html = await request.get(listPath)
  expect(html.ok()).toBe(true)
  expect(html.headers()['cache-control']).toBe('no-store')
  const data = await request.get(`${listPath}_.data`)
  expect(data.ok()).toBe(true)
  expect(data.headers()['cache-control']).toBe('no-store')

  const stylesheet = /<link rel="stylesheet" href="([^"]+\.css)"/.exec(await html.text())?.[1]

  if (stylesheet === undefined) throw new Error('Preview HTML has no stylesheet')
  const asset = await request.get(stylesheet)
  expect(asset.ok()).toBe(true)
  expect(asset.headers()['cache-control'] ?? '').not.toContain('no-store')
})

// The built Worker has no development bypass, and its committed Access configuration is empty or
// real, so unauthenticated superadmin pages and data fail closed; an unverified route match is 404.
test('superadmin pages and Router data reject requests without a valid Access token', async ({ request }) => {
  for (const path of ['/superadmin/', '/en/superadmin/', '/superadmin/_.data', '/SUPERADMIN/'])
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(403)

  expect(
    (await request.get('/superadmin/', { headers: { 'Cf-Access-Jwt-Assertion': 'a.b.c' } })).status(),
  ).toBe(403)
  expect((await request.get('/%73uperadmin/', { maxRedirects: 0 })).status()).toBe(404)
})

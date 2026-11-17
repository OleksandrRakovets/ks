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

// Builds contain no superadmin bypass and the committed Access configuration is empty, so every
// superadmin request fails closed at the Worker, including encoded paths and filtered data requests.
test('superadmin pages and Router data reject requests without a valid Access token', async ({ request }) => {
  for (const path of [
    '/superadmin/',
    '/superadmin/_.data',
    '/SUPERADMIN/',
    '/%73uperadmin/',
    '/super%61dmin/_.data',
    '/%73uperadmin/_.data?_routes=root',
  ])
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(403)

  // Superadmin is not localized: the English path is an ordinary 404, never the superadmin page.
  for (const path of ['/en/superadmin/', '/%65n/superadmin/', '/en/superadmin/_.data'])
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404)
})

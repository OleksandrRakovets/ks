import { setTimeout as delay } from 'node:timers/promises'

import { expect as browserExpect } from '@playwright/test'
import { expect, inject, test } from 'vitest'

import {
  browserName,
  command,
  createMatch,
  listPath,
  openPage,
  returnHints,
  traffic,
  useBrowser,
} from './browser'
import { ageCompletedMatches } from './fixtures'
import { nativeBrowser } from './native-browser'

const browser = useBrowser()

test('an empty list discovers a new match, then polls its scores after the React commit', async () => {
  const { page, context } = browser
  const reads = traffic(page)
  await openPage(page, listPath)
  await browserExpect(page.getByText('No live or recently finished matches.')).toBeVisible()
  const path = await createMatch(context.request, 'Discovered')
  await command(context.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  await page.clock.runFor(60_000)
  const row = page.getByRole('link', { name: /Discovered Alice/ })
  await browserExpect(row).toBeVisible()
  expect(reads.loaders()).toHaveLength(1)
  expect(reads.scores()).toHaveLength(0)

  await command(context.request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
  })
  await command(context.request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
  })
  await page.clock.runFor(30_000)
  await browserExpect(row).toContainText(/Alice\s*4\s*Discovered Bob\s*1/)
  expect(reads.scores()).toHaveLength(1)
  expect(reads.loaders()).toHaveLength(1)
})

test('an open list maintains separate score and membership deadlines for thirty simulated minutes', async () => {
  const { page, context } = browser
  const path = await createMatch(context.request, 'Polling')
  await command(context.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  const reads = traffic(page)
  await openPage(page, listPath)

  // Browser JS executes every deadline; the HTTP server and React still run normally between
  // ticks. A single 30-minute leap would not test the happy-path recurring schedule.
  for (let minute = 0; minute < 30; minute++) {
    const scores = page.waitForResponse((response) => response.url().includes('/live-scores/'))
    await page.clock.runFor(30_000)
    await (await scores).finished()
    await expect.poll(() => reads.scores().length).toBe(minute + 1)
    // React can schedule its commit in a browser task after the last network response. Let
    // those tasks execute before advancing to the next recurring deadline.
    await page.clock.runFor(50)
    await createMatch(context.request, `Membership ${minute}`)
    await page.clock.runFor(30_000)
    // A new row proves the loader projection committed, unlike networkidle (which can already
    // be satisfied from initial navigation) or a response event (which precedes React's commit).
    await browserExpect(
      page.getByRole('link', { name: new RegExp(`Membership ${minute} Alice`) }),
    ).toBeVisible()
    await expect.poll(() => reads.loaders().length).toBe(minute + 1)
    await page.clock.runFor(50)
  }

  expect(reads.scores()).toHaveLength(30)
  expect(reads.loaders()).toHaveLength(30)
  expect(reads.posts()).toHaveLength(0)
}, 60_000)

test.each(['control', 'protocol'])(
  'a %s observer commits one HTTP projection for a WS update',
  async (view) => {
    const { page, context } = browser
    const path = await createMatch(context.request, `Socket ${view}`)
    await command(context.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
    const reads = traffic(page)
    await openPage(page, view === 'protocol' ? `${path}protocol/` : path)
    await command(context.request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
    })

    const board = page.getByRole('region', { name: 'Per-game control container' })
    await browserExpect(board).toContainText(/4\s*\/8/)

    if (view === 'protocol')
      await browserExpect(page.getByRole('article').filter({ hasText: 'Pot +4' })).toContainText('4:0')
    await page.waitForLoadState('networkidle')
    // This fails if Router promise completion is mistaken for React's committed latestSeq.
    expect(reads.loaders()).toHaveLength(1)
    expect(reads.posts()).toHaveLength(0)

    await page.clock.runFor(60_000)
    await expect.poll(() => reads.loaders().length).toBe(2)
    await page.waitForLoadState('networkidle')
    expect(reads.loaders()).toHaveLength(2)
  },
)

test('a local command uses one POST and its automatic loader, without a WS-echo GET', async () => {
  const { page, context } = browser
  const path = await createMatch(context.request, 'Submit')
  await command(context.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  const reads = traffic(page)
  await openPage(page, path)
  await page.getByRole('button', { name: 'Record 4 potted balls for Submit Alice', exact: true }).click()
  await browserExpect(page.getByRole('region', { name: 'Per-game control container' })).toContainText(
    /4\s*\/8/,
  )
  await page.waitForLoadState('networkidle')
  expect(reads.posts()).toHaveLength(1)
  expect(reads.loaders()).toHaveLength(1)

  await returnHints(page)
  await expect.poll(() => reads.loaders().length).toBe(2)
  await page.waitForLoadState('networkidle')
  expect(reads.posts()).toHaveLength(1)
  expect(reads.loaders()).toHaveLength(2)
})

test.each(['control', 'protocol'])(
  'a %s observer becomes Result on completion and stops live work',
  async (view) => {
    const { page, context } = browser
    const path = await createMatch(context.request, `End ${view}`)
    await command(context.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
    await command(context.request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
    })
    await command(context.request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
    })
    let sockets = 0
    page.on('websocket', () => sockets++)
    const reads = traffic(page)
    await openPage(page, view === 'protocol' ? `${path}protocol/` : path)
    await command(context.request, path, { source: 'game', command: { type: 'frame.award', seat: 'A' } })
    await browserExpect(page.getByText(`End ${view} Alice won`, { exact: true })).toBeVisible()
    await browserExpect(page.getByRole('link', { name: 'Result', exact: true })).toBeVisible()
    // The paused clock also pauses browser tasks used for React's passive effects. Allow the
    // finished projection's effect cleanup to run before simulating a later browser return.
    await page.clock.runFor(50)
    await page.waitForLoadState('networkidle')
    expect(reads.loaders()).toHaveLength(1)
    expect(sockets).toBe(1)

    await returnHints(page)
    await page.clock.runFor(180_000)
    await page.waitForLoadState('networkidle')
    expect(reads.loaders()).toHaveLength(1)
    expect(reads.posts()).toHaveLength(0)
    expect(sockets).toBe(1)
  },
)

test('the HTTP watchdog recovers a healthy-looking socket whose updates were dropped', async () => {
  const { page, context } = browser
  const path = await createMatch(context.request, 'Silent')
  await command(context.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  let dropped = 0

  // Preserve the real handshake, but drop invalidations. This is a network fault, not a fake
  // subscription implementation; the page sees a ready WS and no disconnect event.
  await page.routeWebSocket('**/live/**', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      if (String(message).includes('"type":"update"')) dropped++
      else socket.send(message)
    })
  })
  const reads = traffic(page)
  await openPage(page, path)
  await command(context.request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
  })
  await expect.poll(() => dropped).toBe(1)
  expect(reads.loaders()).toHaveLength(0)
  await browserExpect(page.getByRole('region', { name: 'Per-game control container' })).toContainText(
    /0\s*\/8/,
  )
  await page.clock.runFor(60_000)
  await browserExpect(page.getByRole('region', { name: 'Per-game control container' })).toContainText(
    /4\s*\/8/,
  )
  await page.waitForLoadState('networkidle')
  expect(reads.loaders()).toHaveLength(1)
})

test('an offline loader error recovers on real online without replaying a command', async () => {
  const { page, context } = browser
  const path = await createMatch(context.request, 'Offline')
  const reads = traffic(page)
  await openPage(page, path)
  await context.setOffline(true)
  await returnHints(page)
  // Losing the root loader also loses the English loader-owned locale; the boundary falls
  // back to Ukrainian. Either locale must present a real error surface, not stale controls.
  await browserExpect(
    page.getByRole('heading', { name: /Something went wrong|Щось пішло не так/ }),
  ).toBeVisible()
  // Mount the boundary's recovery listeners before the later native online event; the
  // accelerated clock must not leave React's passive effects artificially suspended.
  await page.clock.runFor(50)
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
  await page.evaluate(() => {
    window.addEventListener(
      'online',
      (event) => {
        document.documentElement.dataset.e2eOnline = event.isTrusted ? 'trusted' : 'synthetic'
      },
      { once: true },
    )
  })
  await context.setOffline(false)
  await browserExpect(page.locator('html')).toHaveAttribute('data-e2e-online', 'trusted')
  expect(await page.evaluate(() => navigator.onLine)).toBe(true)
  await browserExpect(page.getByRole('button', { name: 'Break-off', exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(reads.loaders()).toHaveLength(2)
  expect(reads.posts()).toHaveLength(0)
})

test('finished history ignores browser-return and timer hints', async () => {
  const { page } = browser
  const reads = traffic(page)
  await openPage(page, '/en/sparring/matches/finished/')
  await returnHints(page)
  await page.clock.runFor(1_800_000)
  expect(reads.loaders()).toHaveLength(0)
  expect(reads.scores()).toHaveLength(0)
})

test.each(['timer-gap', 'hidden-return'])('recent completed rows expire after a %s', async (mode) => {
  const { page, context } = browser
  const path = await createMatch(context.request, `Recent ${mode}`)
  await command(context.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  await command(context.request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
  })
  await command(context.request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
  })
  await command(context.request, path, { source: 'game', command: { type: 'frame.award', seat: 'A' } })
  const reads = traffic(page)
  await openPage(page, listPath)
  const row = page.getByRole('link', { name: new RegExp(`Recent ${mode} Alice`) })
  await browserExpect(row).toContainText('Finished')

  if (mode === 'hidden-return')
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
  await ageCompletedMatches()
  // fastForward fires overdue timers once, modelling a missed deadline, not ordinary polling.
  await page.clock.fastForward(16 * 60_000)

  if (mode === 'hidden-return') {
    expect(reads.loaders()).toHaveLength(0)
    await returnHints(page)
  }

  await browserExpect(row).toHaveCount(0)
  expect(reads.loaders()).toHaveLength(1)
  expect(reads.scores()).toHaveLength(0)
})

test('hide aborts slow score I/O; return replaces it with one full read and discards its stale body', async () => {
  const { page, context } = browser
  const path = await createMatch(context.request, 'Delayed')
  await command(context.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  await command(context.request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  })
  let release: () => void = () => {}

  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  let captured = false
  let delivered = false
  await page.route('**/live-scores/**', async (route) => {
    const oldResponse = await route.fetch()
    captured = true
    await held
    await route.fulfill({ response: oldResponse })
    delivered = true
  })
  const reads = traffic(page)
  await openPage(page, listPath)
  const row = page.getByRole('link', { name: /Delayed Alice/ })
  await page.clock.runFor(30_000)
  await expect.poll(() => captured).toBe(true)

  try {
    const aborted = page.waitForEvent('requestfailed', (request) => request.url().includes('/live-scores/'))
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    await aborted
    await command(context.request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
    })
    await page.clock.fastForward(1_800_000)
    expect(reads.loaders()).toHaveLength(0)
    await returnHints(page)
    await browserExpect(row).toContainText(/Alice\s*5\s*Delayed Bob\s*0/)
    release()
    await expect.poll(() => delivered).toBe(true)
    await page.clock.runFor(50)
    await browserExpect(row).toContainText(/Alice\s*5\s*Delayed Bob\s*0/)
    expect(reads.scores()).toHaveLength(1)
    expect(reads.loaders()).toHaveLength(1)
    expect(reads.posts()).toHaveLength(0)
  } finally {
    release()
  }
})

test('HTML and Router data are no-store while built assets remain cacheable', async () => {
  const { page, context } = browser
  const html = await context.request.get(listPath)
  expect(html.headers()['cache-control']).toBe('no-store')
  const data = await context.request.get(`${listPath}_.data`)
  expect(data.headers()['cache-control']).toBe('no-store')
  await openPage(page, listPath)
  const assetPath = await page.locator('link[rel="stylesheet"]').first().getAttribute('href')

  if (assetPath === null) throw new Error('Preview has no stylesheet')
  const asset = await context.request.get(assetPath)
  expect(asset.ok()).toBe(true)
  expect(asset.headers()['cache-control']).not.toContain('no-store')
})

test.skipIf(browserName !== 'chromium')(
  'native Chromium hide/freeze stops JS and return catches up the match without synthetic events',
  async () => {
    const request = browser.context.request
    const native = await nativeBrowser()
    const { page, context } = native

    try {
      const path = await createMatch(request, 'Frozen')
      await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
      const reads = traffic(page)
      await page.goto(new URL(path, inject('baseURL')).href)
      await page.waitForLoadState('networkidle')
      const session = await context.newCDPSession(page)
      const browserSession = await native.browser.newBrowserCDPSession()
      const target = await session.send('Target.getTargetInfo')

      const { windowId } = await browserSession.send('Browser.getWindowForTarget', {
        targetId: target.targetInfo.targetId,
      })

      await browserSession.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } })
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden')
      await session.send('Page.setWebLifecycleState', { state: 'frozen' })
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.e2eLifecycle.events.some((event) => event.type === 'freeze' && event.trusted),
          ),
        )
        .toBe(true)
      const ticks = await page.evaluate(() => window.e2eLifecycle.ticks)
      // Node's delay keeps running while the actual page is frozen. A timer fake or an accepted
      // CDP response alone would not prove suspension; unchanged live ticks do.
      await delay(250)
      expect(await page.evaluate(() => window.e2eLifecycle.ticks)).toBe(ticks)
      await command(request, path, {
        source: 'game',
        command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
      })
      expect(reads.loaders()).toHaveLength(0)
      await session.send('Page.setWebLifecycleState', { state: 'active' })
      // "active" unfreezes execution, but does not itself make a minimized page visible.
      await browserSession.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
      await browserSession.send('Target.activateTarget', { targetId: target.targetInfo.targetId })
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible')
      await browserExpect(page.getByRole('region', { name: 'Per-game control container' })).toContainText(
        /4\s*\/8/,
      )
      await delay(100)
      expect(reads.loaders()).toHaveLength(1)
      expect(reads.posts()).toHaveLength(0)
      expect(
        await page.evaluate(() =>
          window.e2eLifecycle.events.some(
            (event) => event.type === 'visibilitychange' && event.trusted && event.visibility === 'visible',
          ),
        ),
      ).toBe(true)
    } finally {
      await native.close()
    }
  },
)

test.skipIf(browserName !== 'chromium').each(['no-store', 'cacheable-fixture'])(
  'native back navigation with %s catches up membership',
  async (policy) => {
    const request = browser.context.request
    const native = await nativeBrowser()
    const { page } = native

    try {
      const origin = inject('baseURL')

      if (policy === 'cacheable-fixture') {
        // Production no-store may prevent BFCache admission. Change only HTTP caching for
        // this fixture; the actual Worker HTML, Router, controllers, and loaders remain real.
        // Router's manifest fetch must also be cacheable for Chromium to admit the document.
        await page.route(
          (url) => url.origin === origin && [listPath, '/en/', '/__manifest'].includes(url.pathname),
          async (route) => {
            const response = await route.fetch()
            await route.fulfill({
              response,
              headers: { ...response.headers(), 'cache-control': 'private, max-age=60' },
            })
          },
        )
      }

      await page.goto(new URL(listPath, origin).href)
      await page.waitForLoadState('networkidle')
      const token = await page.evaluate(() => window.e2eLifecycle.token)
      await page.goto(new URL('/en/', origin).href)
      await createMatch(request, `Back ${policy}`)
      const reads = traffic(page)
      await page.goBack({ waitUntil: 'commit' })
      await browserExpect(page.getByRole('link', { name: new RegExp(`Back ${policy} Alice`) })).toBeVisible()
      const restored = policy === 'cacheable-fixture'
      expect((await page.evaluate(() => window.e2eLifecycle.token)) === token).toBe(restored)
      expect(
        await page.evaluate(() =>
          window.e2eLifecycle.events.some(
            (event) => event.type === 'pageshow' && event.persisted && event.trusted,
          ),
        ),
      ).toBe(restored)
      await delay(100)
      // A fresh document already includes current loader data; a restored document needs
      // exactly one authoritative read. A reload must never pass as successful BFCache.
      expect(reads.loaders()).toHaveLength(restored ? 1 : 0)
      expect(reads.posts()).toHaveLength(0)
    } finally {
      await native.close()
    }
  },
)

import { setTimeout as delay } from 'node:timers/promises'

import {
  command,
  createMatch,
  expect,
  listPath,
  openPage,
  pageSockets,
  returnHints,
  test,
  traffic,
} from './browser'
import { nativeBrowser } from './native-browser'

test('an open list keeps re-arming separate score and membership deadlines', async ({ page, request }) => {
  const path = await createMatch(request, 'Polling')
  await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  const reads = traffic(page)
  await openPage(page, listPath)

  // Browser JS executes every deadline; the HTTP server and React still run normally between
  // ticks. The full schedule is owned by live-list-controller.test.ts; three cycles prove that
  // committed reads re-arm both deadlines in a real page.
  for (let minute = 0; minute < 3; minute++) {
    const scores = page.waitForResponse((response) => response.url().includes('/live-scores/'))
    await page.clock.runFor(30_000)
    await (await scores).finished()
    await expect.poll(() => reads.scores().length).toBe(minute + 1)
    // React can schedule its commit in a browser task after the last network response. Let
    // those tasks execute before advancing to the next recurring deadline.
    await page.clock.runFor(50)
    await createMatch(request, `Membership ${minute}`)
    await page.clock.runFor(30_000)
    // A new row proves the loader projection committed, unlike networkidle (which can already
    // be satisfied from initial navigation) or a response event (which precedes React's commit).
    await expect(page.getByRole('link', { name: new RegExp(`Membership ${minute} Alice`) })).toBeVisible()
    await expect.poll(() => reads.loaders().length).toBe(minute + 1)
    await page.clock.runFor(50)
  }

  await reads.quiet()
  expect(reads.scores()).toHaveLength(3)
  expect(reads.loaders()).toHaveLength(3)
  expect(reads.posts()).toHaveLength(0)
})

for (const view of ['control', 'protocol']) {
  test(`a ${view} observer commits one HTTP projection for a WS update`, async ({ page, request }) => {
    const path = await createMatch(request, `Socket ${view}`)
    await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
    let muteUpdates = false
    let dropped = 0
    await page.routeWebSocket('**/live/**', (socket) => {
      const server = socket.connectToServer()
      server.onMessage((message) => {
        if (muteUpdates && String(message).includes('"type":"update"')) dropped++
        else socket.send(message)
      })
    })
    const reads = traffic(page)
    await openPage(page, view === 'protocol' ? `${path}protocol/` : path)
    await command(request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
    })

    const board = page.getByRole('region', { name: 'Per-game control container' })
    await expect(board).toContainText(/4\s*\/8/)

    if (view === 'protocol')
      await expect(page.getByRole('listitem').filter({ hasText: '+4' })).toContainText('4:0')
    await reads.quiet()
    // This fails if Router promise completion is mistaken for React's committed latestSeq.
    expect(reads.loaders()).toHaveLength(1)
    expect(reads.posts()).toHaveLength(0)

    // Prove the watchdog still commits after a successful WS-driven read. A GET count alone
    // would pass even if its projection never reached React. Drop only the next invalidation.
    await page.clock.runFor(50)
    muteUpdates = true
    await command(request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
    })
    await expect.poll(() => dropped).toBe(1)
    await page.clock.runFor(60_000)
    await expect(board).toContainText(/4\s*\/8\s*8\/\s*1/)

    if (view === 'protocol')
      await expect(page.getByRole('listitem').filter({ hasText: '+1' })).toContainText('4:1')
    await page.clock.runFor(50)
    await reads.quiet()
    expect(reads.loaders()).toHaveLength(2)
  })
}

test('a local command uses one POST and its automatic loader, without a WS-echo GET', async ({
  page,
  request,
}) => {
  const path = await createMatch(request, 'Submit')
  await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  const reads = traffic(page)
  await openPage(page, path)
  await page.getByRole('button', { name: 'Record 4 potted balls for Submit Alice', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Per-game control container' })).toContainText(/4\s*\/8/)
  await reads.quiet()
  expect(reads.posts()).toHaveLength(1)
  expect(reads.loaders()).toHaveLength(1)

  await returnHints(page)
  await expect.poll(() => reads.loaders().length).toBe(2)
  await reads.quiet()
  expect(reads.posts()).toHaveLength(1)
  expect(reads.loaders()).toHaveLength(2)
})

for (const view of ['control', 'protocol']) {
  test(`a ${view} observer becomes Result on completion and stops live work`, async ({ page, request }) => {
    const path = await createMatch(request, `End ${view}`)
    await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
    await command(request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
    })
    await command(request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
    })
    const sockets = await pageSockets(page)
    const reads = traffic(page)
    await openPage(page, view === 'protocol' ? `${path}protocol/` : path)
    await command(request, path, { source: 'game', command: { type: 'frame.award', seat: 'A' } })
    await expect(page.getByText(`End ${view} Alice won`, { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Result', exact: true })).toBeVisible()
    expect(reads.loaders()).toHaveLength(1)
    // The page itself released its only socket (CLOSING or CLOSED); when the close event then
    // arrives is transport timing.
    const [state, ...others] = await sockets.states()
    expect(others).toHaveLength(0)
    expect(state).toBeGreaterThanOrEqual(WebSocket.CLOSING)

    // Deliberately no settling tick: Result's DOM commit must already release the controller.
    // Return hints must not reach active listeners waiting for deferred passive cleanup.
    await returnHints(page)
    await page.clock.runFor(180_000)
    await reads.quiet()
    expect(reads.loaders()).toHaveLength(1)
    expect(reads.posts()).toHaveLength(0)
    expect((await sockets.states()).length).toBe(1)
  })
}

test('an offline loader error recovers on a trusted online event', async ({ page, context, request }) => {
  const path = await createMatch(request, 'Offline')
  const reads = traffic(page)
  await openPage(page, path)
  await context.setOffline(true)
  await returnHints(page)
  // Losing the root loader also loses the English loader-owned locale; the boundary falls
  // back to Ukrainian. Either locale must present a real error surface, not stale controls.
  await expect(page.getByRole('heading', { name: /Something went wrong|Щось пішло не так/ })).toBeVisible()
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
  await expect(page.locator('html')).toHaveAttribute('data-e2e-online', 'trusted')
  expect(await page.evaluate(() => navigator.onLine)).toBe(true)
  await expect(page.getByRole('button', { name: 'Break-off', exact: true })).toBeVisible()
  await reads.quiet()
  expect(reads.loaders()).toHaveLength(2)
})

test('finished history ignores browser-return and timer hints', async ({ page }) => {
  const reads = traffic(page)
  await openPage(page, '/en/sparring/matches/finished/')
  await expect(page.getByRole('heading', { name: 'Matches', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Finished', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await returnHints(page)
  await page.clock.runFor(1_800_000)
  await reads.quiet()
  expect(reads.loaders()).toHaveLength(0)
  expect(reads.scores()).toHaveLength(0)
})

test('hide aborts slow score I/O; return replaces the cancelled request with one full read', async ({
  page,
  request,
}) => {
  const path = await createMatch(request, 'Delayed')
  await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  await command(request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 1 },
  })
  let release: () => void = () => {}

  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  let captured = false
  await page.route('**/live-scores/**', async (route) => {
    const oldResponse = await route.fetch()
    captured = true
    await held
    // The browser has already failed this request; fulfilling it delivers nothing. This proves
    // transport cancellation, not rejection of a stale body delivered despite cancellation.
    await route.fulfill({ response: oldResponse }).catch(() => undefined)
  })
  const reads = traffic(page)

  try {
    await openPage(page, listPath)
    const row = page.getByRole('link', { name: /Delayed Alice/ })
    await page.clock.runFor(30_000)
    await expect.poll(() => captured).toBe(true)
    const aborted = page.waitForEvent('requestfailed', (request) => request.url().includes('/live-scores/'))
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    await aborted
    await command(request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
    })
    await page.clock.fastForward(1_800_000)
    expect(reads.loaders()).toHaveLength(0)
    await returnHints(page)
    await expect(row).toContainText(/Delayed Alice\s*5\s*0\s*Delayed Bob\s*0\s*0/)
    await reads.quiet()
    expect(reads.scores()).toHaveLength(1)
    expect(reads.loaders()).toHaveLength(1)
    expect(reads.posts()).toHaveLength(0)
  } finally {
    release()
  }
})

test.describe('native Chromium', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Uses Chromium DevTools Protocol lifecycle control',
  )

  test('hide/freeze stops JS and return catches up the match without synthetic events', async ({
    server,
    request,
  }) => {
    const native = await nativeBrowser()
    const { page, context } = native

    try {
      const path = await createMatch(request, 'Frozen')
      await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
      const reads = traffic(page)
      await page.goto(new URL(path, server.baseURL).href)
      await page.waitForLoadState('networkidle')
      const session = await context.newCDPSession(page)
      const browserSession = await native.browser.newBrowserCDPSession()
      const target = await session.send('Target.getTargetInfo')

      const { windowId } = await browserSession.send('Browser.getWindowForTarget', {
        targetId: target.targetInfo.targetId,
      })

      const visibleTicks = await page.evaluate(() => window.e2eLifecycle.ticks)
      await expect.poll(() => page.evaluate(() => window.e2eLifecycle.ticks)).toBeGreaterThan(visibleTicks)
      await browserSession.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } })
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden')
      const hiddenTicks = await page.evaluate(() => window.e2eLifecycle.ticks)
      const hiddenStarted = Date.now()
      // Establish that this hidden, unfrozen page still executes its timer. Compare freezing
      // over a longer interval than that observed baseline, not just a throttled 250ms gap.
      await expect
        .poll(() => page.evaluate(() => window.e2eLifecycle.ticks), { timeout: 4_000 })
        .toBeGreaterThan(hiddenTicks + 1)
      const frozenObservation = Math.max(1_500, 2 * (Date.now() - hiddenStarted))
      await session.send('Page.setWebLifecycleState', { state: 'frozen' })
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.e2eLifecycle.events.some((event) => event.type === 'freeze' && event.trusted),
          ),
        )
        .toBe(true)
      const ticks = await page.evaluate(() => window.e2eLifecycle.ticks)
      // Node keeps running while the page is frozen. Require the trusted freeze event, live
      // baselines, and observed quiescence together; an accepted CDP command alone proves little.
      await delay(frozenObservation)
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
      await expect.poll(() => page.evaluate(() => window.e2eLifecycle.ticks)).toBeGreaterThan(ticks)
      await expect(page.getByRole('region', { name: 'Per-game control container' })).toContainText(/4\s*\/8/)
      await reads.quiet()
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
  })

  test('genuine BFCache restoration catches up membership with one read', async ({ server, request }) => {
    const native = await nativeBrowser()
    const { page } = native

    try {
      const origin = server.baseURL
      // Production no-store may prevent BFCache admission. Change only HTTP caching for this
      // fixture; the actual Worker HTML, Router, controllers, and loaders remain real. Router's
      // manifest fetch must also be cacheable for Chromium to admit the document.
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

      await page.goto(new URL(listPath, origin).href)
      await page.waitForLoadState('networkidle')
      const token = await page.evaluate(() => window.e2eLifecycle.token)
      await page.goto(new URL('/en/', origin).href)
      await createMatch(request, 'Back cacheable')
      const reads = traffic(page)
      await page.goBack({ waitUntil: 'commit' })
      await expect(page.getByRole('link', { name: /Back cacheable Alice/ })).toBeVisible()
      // A reload must never pass as successful BFCache: require the same document and a
      // trusted persisted pageshow, then exactly one authoritative read.
      expect(await page.evaluate(() => window.e2eLifecycle.token)).toBe(token)
      expect(
        await page.evaluate(() =>
          window.e2eLifecycle.events.some(
            (event) => event.type === 'pageshow' && event.persisted && event.trusted,
          ),
        ),
      ).toBe(true)
      await reads.quiet()
      expect(reads.loaders()).toHaveLength(1)
      expect(reads.posts()).toHaveLength(0)
    } finally {
      await native.close()
    }
  })
})

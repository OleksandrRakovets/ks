import { type MatchCommand, newCommandId } from '@ks/core'
import { type APIRequestContext, test as base, expect, type Page, type Request } from '@playwright/test'

import { type E2EServer, startServer } from './server'

export { expect }

declare global {
  interface Window {
    e2eSockets: WebSocket[]
  }
}

export const listPath = '/en/sparring/matches/'

/**
 * Playwright owns orchestration, contexts, and retrying DOM assertions. Each worker serves one
 * fresh disposable store; every test still gets a new context (cookies, storage, sockets) and
 * page. API fixture writes go through the real HTTP routes and never reach into repositories.
 */
export const test = base.extend<{ page: Page }, { server: E2EServer }>({
  server: [
    // Playwright reads fixture dependencies from this parameter pattern; the server has none.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const server = await startServer()

      try {
        await use(server)
      } finally {
        await server.close()
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ server }, use) => use(server.baseURL),
  page: async ({ page }, use) => {
    // Install before page code captures timer functions. Only the page clock changes: D1 and
    // MatchRoom still use real wall time.
    await page.clock.install()
    await use(page)
  },
})

/** Loads a real route, then pauses its clock after assets/hydration have settled. */
export async function openPage(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
}

/** Creates a match with asymmetric participant names via the public setup action. */
export async function createMatch(
  request: APIRequestContext,
  name: string,
  {
    frames = 1,
    targets = [8, 8],
    game = 'free-pyramid',
  }: { frames?: number; targets?: readonly [number, number]; game?: 'free-pyramid' | 'strila-v2' } = {},
) {
  const response = await request.post(`/en/sparring/setup/${game}/`, {
    form: {
      seatAName: `Test-${name} Alice`,
      seatBName: `Test-${name} Bob`,
      matchTargetFrames: String(frames),
      targetA: String(targets[0]),
      targetB: String(targets[1]),
      firstBreakerSeat: 'A',
    },
    maxRedirects: 0,
  })

  expect(response.status()).toBe(302)
  const path = response.headers().location

  if (path === undefined || path === '') throw new Error('Match setup did not redirect')

  return path
}

/** Sends exactly one unique Command through the real action; does not retry failed mutations. */
export async function command(
  request: APIRequestContext,
  path: string,
  body: Omit<MatchCommand, 'commandId'>,
) {
  const response = await request.post(`${path.replace(/\/$/, '')}.data`, {
    form: { command: JSON.stringify({ ...body, commandId: newCommandId() }) },
  })

  expect(response.ok()).toBe(true)
  const action = await response.text()
  // Router encodes its single-fetch response. Successful actions expose only `ok`; rejected
  // Commands still return HTTP 200, so status alone would silently accept a bad fixture.
  expect(action).toContain('"ok"')
  expect(action).not.toContain('"errorKey"')
}

/**
 * How long the page network must stay idle before asserting that no further request happened.
 * Absence cannot be awaited; `networkidle` resolves immediately once a document has reached it.
 * Paused page clocks do not advance during this real-time window, so no page timer fires here.
 */
const QUIET_PERIOD_MS = 300

/** Records browser-side GET/POST traffic. API fixture writes do not enter this ledger. */
export function traffic(page: Page) {
  const requests: Request[] = []
  // Track identities: requests already running when the ledger attaches finish unseen.
  const inFlight = new Set<Request>()
  let lastActivity = Date.now()

  const settle = (request: Request) => {
    if (inFlight.delete(request)) lastActivity = Date.now()
  }

  page.on('request', (request) => {
    requests.push(request)
    inFlight.add(request)
    lastActivity = Date.now()
  })
  page.on('requestfinished', settle)
  page.on('requestfailed', settle)

  return {
    loaders: () =>
      requests.filter(
        (request) => request.method() === 'GET' && new URL(request.url()).pathname.endsWith('.data'),
      ),
    scores: () =>
      requests.filter((request) => new URL(request.url()).pathname === '/api/sparring-matches/live-scores/'),
    posts: () => requests.filter((request) => request.method() === 'POST'),
    /** Waits until no request is in flight and none has started for the quiet period. */
    quiet: async () =>
      expect
        .poll(() => inFlight.size === 0 && Date.now() - lastActivity >= QUIET_PERIOD_MS, { intervals: [50] })
        .toBe(true),
  }
}

/**
 * Records the page's own WebSocket objects. A page releases a socket by calling `close()`, which
 * moves it to CLOSING at once; Playwright's `isClosed()` instead waits for the closing handshake
 * and TCP teardown, which local workerd can hold open for seconds (workerd#7566).
 */
export async function pageSockets(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket
    const opened: WebSocket[] = []
    window.e2eSockets = opened
    window.WebSocket = class extends Native {
      constructor(...args: ConstructorParameters<typeof Native>) {
        super(...args)
        opened.push(this)
      }
    }
  })

  return {
    /** Ready states of every socket the page has opened, in creation order. */
    states: async () => page.evaluate(() => window.e2eSockets.map((socket) => socket.readyState)),
  }
}

/**
 * Simulates overlapping browser-return hints in one JS turn. These are deliberately synthetic:
 * Linux headless tabs do not model Safari's tab/app switching, and opening a second page does
 * not reliably change document.visibilityState. Native Chromium tests use genuine page freezing.
 */
export async function returnHints(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
  })
}

import { type MatchCommand, newCommandId } from '@ks/core'
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect as browserExpect,
  chromium,
  type Page,
  type Request,
  webkit,
} from '@playwright/test'
import { afterAll, afterEach, beforeAll, beforeEach, inject } from 'vitest'

export const listPath = '/en/sparring/matches/'

export const browserName = process.env.E2E_BROWSER ?? 'chromium'

/**
 * Vitest owns orchestration in Node; Playwright owns the browser and retrying DOM assertions.
 * The observer gets a new context (cookies, storage, clock, sockets) for every test. API fixture
 * writes go through the real HTTP routes and never reach into application repositories.
 */
export function useBrowser() {
  let browser: Browser
  let context: BrowserContext
  let page: Page

  beforeAll(async () => {
    if (browserName !== 'chromium' && browserName !== 'webkit')
      throw new Error('E2E_BROWSER must be chromium or webkit')
    browser = await (browserName === 'webkit' ? webkit : chromium).launch()
  })

  beforeEach(async () => {
    context = await browser.newContext({ baseURL: inject('baseURL') })
    page = await context.newPage()
    // Install before page code captures timer functions. Only the page clock changes: D1 and
    // MatchRoom still use real wall time. Tests which alter recent expiry must say so explicitly.
    await page.clock.install()
  })

  afterEach(async () => context.close())
  afterAll(async () => browser.close())

  return {
    get page() {
      return page
    },
    get context() {
      return context
    },
  }
}

/** Loads a real route, then pauses its clock after assets/hydration have settled. */
export async function openPage(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
}

/** Creates a one-frame match with asymmetric participant names via the public setup action. */
export async function createMatch(request: APIRequestContext, name: string) {
  const response = await request.post('/en/sparring/setup/free-pyramid/', {
    form: {
      seatAName: `${name} Alice`,
      seatBName: `${name} Bob`,
      matchTargetFrames: '1',
      targetA: '8',
      targetB: '8',
      firstBreakerSeat: 'A',
    },
    maxRedirects: 0,
  })

  browserExpect(response.status()).toBe(302)
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

  browserExpect(response.ok()).toBe(true)
  const action = await response.text()
  // Router encodes its single-fetch response. Successful actions now expose only `ok`;
  // rejected Commands still return HTTP 200, so status alone would silently accept a bad fixture.
  browserExpect(action).toContain('"ok"')
  browserExpect(action).not.toContain('"errorKey"')
}

/** Records browser-side GET/POST traffic. API fixture writes do not enter this ledger. */
export function traffic(page: Page) {
  const requests: Request[] = []
  page.on('request', (request) => requests.push(request))

  return {
    loaders: () =>
      requests.filter(
        (request) => request.method() === 'GET' && new URL(request.url()).pathname.endsWith('.data'),
      ),
    scores: () =>
      requests.filter((request) => new URL(request.url()).pathname === '/api/sparring-matches/live-scores/'),
    posts: () => requests.filter((request) => request.method() === 'POST'),
  }
}

/**
 * Simulates overlapping browser-return hints in one JS turn. These are deliberately synthetic:
 * Linux headless tabs do not model Safari's tab/app switching, and opening a second page does
 * not reliably change document.visibilityState. A separate CDP test uses genuine page freezing.
 */
export async function returnHints(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
  })
}

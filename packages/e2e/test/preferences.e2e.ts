import type { Page } from '@playwright/test'

import { expect, test } from './browser'

const setupPath = '/en/sparring/setup/free-pyramid/'

test('a UI theme choice survives reload without leaking into an isolated context', async ({
  page,
  browser,
  server,
}) => {
  // Deliberately oppose the OS: following prefers-color-scheme cannot satisfy this choice.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(setupPath)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  await expect.poll(() => themeCookie(page)).toBe('club-light')
  const light = await bodyColors(page)

  await page.reload()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  await expect.poll(() => bodyColors(page)).toEqual(light)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const isolated = await browser.newContext({ baseURL: server.baseURL, colorScheme: 'light' })

  try {
    const otherPage = await isolated.newPage()
    await otherPage.goto(setupPath)
    // KS defaults to explicit dark, even on a light OS. No cookie means no inherited preference.
    await expect(otherPage.locator('html')).toHaveCSS('color-scheme', 'dark')
    expect(await themeCookie(otherPage)).toBeUndefined()
    expect(await bodyColors(otherPage)).not.toEqual(light)
    expect(await themeCookie(page)).toBe('club-light')
  } finally {
    await isolated.close()
  }

  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect.poll(() => themeCookie(page)).toBe('club-dark')
  await page.reload()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
})

test('auto follows both emulated OS color schemes in the same document after clearing an override', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(setupPath)
  await page.waitForLoadState('networkidle')
  const dark = await bodyColors(page)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  const light = await bodyColors(page)
  expect(light).not.toEqual(dark)
  await page.getByRole('button', { name: 'Auto', exact: true }).click()
  await expect.poll(() => themeCookie(page)).toBe('auto')
  await expect.poll(() => bodyColors(page)).toEqual(dark)
  await page.reload()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light dark')
  await expect.poll(() => bodyColors(page)).toEqual(dark)
  await markDocument(page)

  // Compare rendered foreground/background with the explicit palettes, not just matchMedia.
  // No reload: this would fail if auto resolved the OS only at document startup.
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => bodyColors(page)).toEqual(light)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => bodyColors(page)).toEqual(dark)
  expect(await hasDocumentMarker(page)).toBe(true)
  expect(await themeCookie(page)).toBe('auto')
})

test('locale UI preserves a deep path, rematch query and fragment through new documents in both directions', async ({
  page,
  baseURL,
  browserName,
}) => {
  test.fixme(browserName === 'webkit', 'BIL-78: WebKit intermittently reloads the current locale instead')

  const suffix =
    '?rematch=1&seatAName=Alice+Kyiv&seatBName=Bob%26Co&matchTargetFrames=3&targetA=6&targetB=8#players'

  const englishPath = `${setupPath}${suffix}`
  const ukrainianPath = `/sparring/setup/free-pyramid/${suffix}`
  await page.goto(englishPath)
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('Player A', { exact: true })).toHaveValue('Alice Kyiv')
  await expect(page.getByLabel('Player B', { exact: true })).toHaveValue('Bob&Co')

  for (const destination of [
    {
      menu: 'Menu',
      choice: 'Українська',
      path: ukrainianPath,
      lang: 'uk',
      playerA: 'Гравець A',
      playerB: 'Гравець B',
    },
    {
      menu: 'Меню',
      choice: 'English',
      path: englishPath,
      lang: 'en',
      playerA: 'Player A',
      playerB: 'Player B',
    },
  ]) {
    await markDocument(page)
    await page.getByRole('button', { name: destination.menu, exact: true }).click()

    const documentResponse = page.waitForResponse(
      (response) =>
        response.request().isNavigationRequest() && response.request().resourceType() === 'document',
    )

    await page.getByRole('button', { name: destination.choice, exact: true }).click()
    expect((await documentResponse).status()).toBe(200)
    await expect(page).toHaveURL(`${baseURL}${destination.path}`)
    await expect(page.locator('html')).toHaveAttribute('lang', destination.lang)
    await expect(page.getByLabel(destination.playerA, { exact: true })).toHaveValue('Alice Kyiv')
    await expect(page.getByLabel(destination.playerB, { exact: true })).toHaveValue('Bob&Co')
    // A client-side translation or history.pushState must not pass as reloadDocument navigation.
    expect(await hasDocumentMarker(page)).toBe(false)
  }
})

async function themeCookie(page: Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name === 'ks.theme')?.value
}

async function bodyColors(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.body)

    return { background: style.backgroundColor, foreground: style.color }
  })
}

async function markDocument(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(window, 'e2ePreferencesDocument', { value: true })
  })
}

async function hasDocumentMarker(page: Page) {
  return page.evaluate(() => Object.hasOwn(window, 'e2ePreferencesDocument'))
}

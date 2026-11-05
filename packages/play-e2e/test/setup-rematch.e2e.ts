import type { Page } from '@playwright/test'

import { command, expect, openPage, test, traffic } from './browser'

const setupPath = '/en/sparring/setup/free-pyramid/'

test('visible setup submits once, normalizes names, and remembers suggestions across a reload', async ({
  page,
}) => {
  const requests = traffic(page)
  await openPage(page, setupPath)
  // Setup is not a timer-gap test. Resume the helper's clock so React effects and the
  // real coin animation can run; no deterministic winner is needed to choose either seat.
  await page.clock.resume()
  const start = page.getByRole('button', { name: 'Start match', exact: true })
  await expect(start).toBeDisabled()
  await page.getByLabel('Player A', { exact: true }).fill('  Alice   North  ')
  await page.getByLabel('Player B', { exact: true }).fill('Alice North')
  await expect(page.getByLabel('Race to how many wins', { exact: true })).toHaveCount(0)
  await expect(start).toBeDisabled()

  await page.getByLabel('Player B', { exact: true }).fill('  Bob   Delta  ')
  await page.getByRole('spinbutton', { name: 'Race to how many wins', exact: true }).fill('2')
  await page.getByRole('spinbutton', { name: 'Alice North target points', exact: true }).fill('5')
  await page.getByRole('spinbutton', { name: 'Bob Delta target points', exact: true }).fill('7')
  await chooseBreaker(page, 'Bob Delta')
  await expect(start).toBeEnabled()
  await start.click()
  await expect(page).toHaveURL(/\/en\/sparring\/match\/free-pyramid\/[^/]+\/$/)
  const matchPath = new URL(page.url()).pathname
  const board = page.getByRole('region', { name: 'Per-game control container' })
  await expect(board.getByText('Alice North', { exact: true })).toBeVisible()
  await expect(board.getByText('Bob Delta', { exact: true })).toBeVisible()
  await expect(board).toContainText(/0\s*\/5/)
  await expect(board).toContainText(/7\/\s*0/)
  await requests.quiet()
  expect(requests.posts()).toHaveLength(1)
  expect(requests.posts()[0]?.url()).toContain(setupPath)
  expect(requests.loaders()).toHaveLength(1)
  expect(requests.loaders()[0]?.url()).toContain(matchPath)

  await page.goto(setupPath)
  // A document navigation (not Router revalidation) discards the module's in-memory
  // recent-player cache. Suggestions must now come from the submitted localStorage data.
  const reload = await page.reload()
  expect(reload?.request().isNavigationRequest()).toBe(true)
  const suggestionsA = page.locator('#seatANameSuggestions option')
  const suggestionsB = page.locator('#seatBNameSuggestions option')
  await expect(suggestionsA).toHaveCount(2)
  expect(
    await suggestionsA.evaluateAll((options) => options.map((option) => option.getAttribute('value'))),
  ).toEqual(['Alice North', 'Bob Delta'])
  await expect(page.getByLabel('Player A', { exact: true })).toHaveAttribute('list', 'seatANameSuggestions')
  await expect(page.getByLabel('Player B', { exact: true })).toHaveAttribute('list', 'seatBNameSuggestions')
  await page.getByLabel('Player B', { exact: true }).fill('  bob   delta  ')
  await expect(suggestionsA).toHaveCount(1)
  await expect(suggestionsA).toHaveAttribute('value', 'Alice North')
  await page.getByLabel('Player A', { exact: true }).fill('Alice North')
  await expect(suggestionsB).toHaveCount(1)
  await expect(suggestionsB).toHaveAttribute('value', 'Bob Delta')
  expect(requests.posts()).toHaveLength(1)
})

test('editing a player name clears the breaker and requires a new toss and selection', async ({ page }) => {
  const requests = traffic(page)
  await openPage(page, setupPath)
  await page.clock.resume()
  await page.getByLabel('Player A', { exact: true }).fill('Ada West')
  await page.getByLabel('Player B', { exact: true }).fill('Ben East')
  await chooseBreaker(page, 'Ada West')
  const start = page.getByRole('button', { name: 'Start match', exact: true })
  await expect(start).toBeEnabled()

  await page.getByLabel('Player A', { exact: true }).fill('Cara South')
  await expect(start).toBeDisabled()
  await expect(page.locator('input[name="firstBreakerSeat"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ada West breaks', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Toss coin', exact: true })).toBeEnabled()
  await chooseBreaker(page, 'Ben East')
  await expect(page.locator('input[name="firstBreakerSeat"]')).toHaveValue('B')
  await expect(start).toBeEnabled()
  expect(requests.posts()).toHaveLength(0)
})

test('Long Pyramid rematch restores asymmetric names, targets, and non-default rack rollover in editable controls', async ({
  page,
  request,
}) => {
  // Three real Commands finish a small one-rack fixture; no gameplay matrix or direct
  // database writes are needed to exercise archive -> RematchLink -> setup loader wiring.
  const created = await request.post('/en/sparring/setup/free-pyramid-long/', {
    form: {
      seatAName: 'Mira Stone',
      seatBName: 'Noah Reed',
      matchTargetFrames: '1',
      targetA: '2',
      targetB: '5',
      firstBreakerSeat: 'A',
      rackRollover: '15',
    },
    maxRedirects: 0,
  })

  expect(created.status()).toBe(302)
  const matchPath = created.headers().location

  if (matchPath === undefined) throw new Error('Long Pyramid fixture did not redirect')
  await command(request, matchPath, {
    source: 'match',
    command: { type: 'frame.commence', seat: 'A' },
  })
  await command(request, matchPath, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 2 },
  })
  await command(request, matchPath, { source: 'game', command: { type: 'frame.award', seat: 'A' } })
  await openPage(page, matchPath)
  await page.clock.resume()
  await expect(page.getByText('Mira Stone won', { exact: true })).toBeVisible()
  const requests = traffic(page)
  await page.getByRole('link', { name: 'Rematch with the same players', exact: true }).click()
  await expect(page).toHaveURL(/\/en\/sparring\/setup\/free-pyramid-long\/\?rematch=1&/)
  await expect(page.getByLabel('Player A', { exact: true })).toHaveValue('Mira Stone')
  await expect(page.getByLabel('Player B', { exact: true })).toHaveValue('Noah Reed')
  const targetA = page.getByRole('spinbutton', { name: 'Mira Stone target points', exact: true })
  const targetB = page.getByRole('spinbutton', { name: 'Noah Reed target points', exact: true })
  await expect(targetA).toHaveValue('2')
  await expect(targetB).toHaveValue('5')
  await expect(page.locator('input[name="matchTargetFrames"]')).toHaveValue('1')
  await expect(page.locator('input[name="matchTargetFrames"]')).toHaveAttribute('type', 'hidden')
  await expect(page.getByRole('button', { name: 'at 15 newer', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Start match', exact: true })).toBeDisabled()
  await expect(page.locator('input[name="firstBreakerSeat"]')).toHaveCount(0)

  await targetA.fill('3')
  await targetB.fill('7')
  await page.getByLabel('Player B', { exact: true }).fill('Noah Lake')
  await page.getByRole('button', { name: 'at 14 usual', exact: true }).click()
  await expect(targetA).toHaveValue('3')
  await expect(page.getByRole('spinbutton', { name: 'Noah Lake target points', exact: true })).toHaveValue('7')
  await expect(page.locator('input[name="rackRollover"]')).toHaveValue('14')
  await expect(page.getByRole('button', { name: 'at 14 usual', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(requests.posts()).toHaveLength(0)
})

async function chooseBreaker(page: Page, name: string) {
  await page.getByRole('button', { name: 'Toss coin', exact: true }).click()
  const choice = page.getByRole('button', { name: `${name} breaks`, exact: true })
  await expect(choice).toBeVisible()
  await choice.click()
  await expect(choice).toHaveAttribute('aria-pressed', 'true')
}

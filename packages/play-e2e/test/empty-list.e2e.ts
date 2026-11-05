import { command, createMatch, expect, listPath, openPage, test, traffic } from './browser'
import { startServer } from './server'

test('an empty list discovers a new match, then polls its scores after the React commit', async ({
  browser,
}) => {
  // The worker's shared store already holds other files' matches. Only a store of its own can
  // present the empty list, whose deadlines must still mount.
  const server = await startServer()
  const context = await browser.newContext({ baseURL: server.baseURL })

  try {
    const page = await context.newPage()
    await page.clock.install()
    const reads = traffic(page)
    await openPage(page, listPath)
    await expect(page.getByText('No live or recently finished matches.')).toBeVisible()
    const path = await createMatch(context.request, 'Discovered')
    await command(context.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
    await page.clock.runFor(60_000)
    const row = page.getByRole('link', { name: /Test-Discovered Alice/ })
    await expect(row).toBeVisible()
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
    // Active cards show current Frame points followed by Frame wins for each seat.
    await expect(row).toContainText(/Test-Discovered Alice\s*4\s*0\s*Test-Discovered Bob\s*1\s*0/)
    expect(reads.scores()).toHaveLength(1)
    expect(reads.loaders()).toHaveLength(1)
  } finally {
    await context.close()
    await server.close()
  }
})

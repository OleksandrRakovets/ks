import { command, createMatch, expect, listPath, openPage, test, traffic } from './browser'

// Runs in its own Playwright project, hence its own worker and disposable store: other files'
// matches would otherwise fill the list whose empty state must still mount its deadlines.
test('an empty list discovers a new match, then polls its scores after the React commit', async ({
  page,
  request,
}) => {
  const reads = traffic(page)
  await openPage(page, listPath)
  await expect(page.getByText('No live or recently finished matches.')).toBeVisible()
  const path = await createMatch(request, 'Discovered')
  await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  await page.clock.runFor(60_000)
  const row = page.getByRole('link', { name: /Discovered Alice/ })
  await expect(row).toBeVisible()
  expect(reads.loaders()).toHaveLength(1)
  expect(reads.scores()).toHaveLength(0)

  await command(request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
  })
  await command(request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
  })
  await page.clock.runFor(30_000)
  // Active cards show current Frame points followed by Frame wins for each seat.
  await expect(row).toContainText(/Discovered Alice\s*4\s*0\s*Discovered Bob\s*1\s*0/)
  expect(reads.scores()).toHaveLength(1)
  expect(reads.loaders()).toHaveLength(1)
})

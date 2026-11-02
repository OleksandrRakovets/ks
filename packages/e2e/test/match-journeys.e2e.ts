import { command, createMatch, expect, openPage, test, traffic } from './browser'

// These journeys replace hand-built MatchRoom responses in application unit tests with the
// real room: last-command enrichment, Correction fan-out, frame preparation, and archival.

test('an accepted undo reaches another observer, exposes the effective last command, and stays in the Protocol', async ({
  page,
  context,
  request,
}) => {
  const path = await createMatch(request, 'Undo')
  await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  await command(request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
  })
  // The observer keeps real timers, so only the socket invalidation can update it promptly;
  // its watchdog would take a minute.
  const observer = await context.newPage()
  await observer.goto(path)
  const observerBoard = observer.getByRole('region', { name: 'Per-game control container' })
  await expect(observerBoard).toContainText(/Undo Alice\s*Undo Bob\s*4\s*\/8\s*8\/\s*0/)
  const observerReads = traffic(observer)
  await openPage(page, path)
  await expect(page.getByText('Pot +4', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const board = page.getByRole('region', { name: 'Per-game control container' })
  await expect(board).toContainText(/Undo Alice\s*Undo Bob\s*0\s*\/8\s*8\/\s*0/)
  // MatchRoom resolves the effective predecessor: commencement is now last and not correctable.
  await expect(page.getByText('Frame commenced', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0)

  await expect(observerBoard).toContainText(/Undo Alice\s*Undo Bob\s*0\s*\/8\s*8\/\s*0/)
  await observerReads.quiet()
  expect(observerReads.loaders()).toHaveLength(1)
  expect(observerReads.posts()).toHaveLength(0)

  await page.goto(`${path}protocol/`)
  // The Correction joins its Command: one struck row without a score, no separate correction row.
  const rows = page.getByRole('listitem')
  // Lane rows may also carry an aria-hidden five-minute time marker.
  await expect(rows).toHaveText([/^Frame\s1$/, /Undo Alice: Break-off$/, /Undo Alice: \+4↶Corrected$/])
  const corrected = rows.nth(2).getByRole('button')
  await corrected.click()
  await expect(corrected).toHaveAttribute('aria-expanded', 'true')
  await expect(corrected).toContainText(/corrected at \d\d:\d\d/)
})

test('a race to two prepares the next frame, then archives the finished match for D1 reads', async ({
  page,
}) => {
  const path = await createMatch(page.request, 'Race', { frames: 2, targets: [2, 2] })
  await command(page.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  await command(page.request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 2 },
  })
  await openPage(page, path)
  await page.clock.resume()
  const board = page.getByRole('region', { name: 'Per-game control container' })

  await page.getByRole('button', { name: 'Award frame', exact: true }).click()
  await expect(page.getByText('Frame 2', { exact: true })).toBeVisible()
  // Next frame: points reset, frame wins 1:0, and the opponent breaks an uncommenced frame.
  await expect(board).toContainText(/Race Alice\s*Race Bob\s*0\s*\/2\s*1:0/)
  await expect(page.getByRole('button', { name: 'Break-off', exact: true })).toBeVisible()

  await command(page.request, path, { source: 'match', command: { type: 'frame.commence', seat: 'B' } })
  await command(page.request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 2 },
  })
  await page.reload()
  await page.getByRole('button', { name: 'Award frame', exact: true }).click()
  await expect(page.getByText('Race Alice won', { exact: true })).toBeVisible()

  // The match-ending POST returns only after archival and D1 completion. The finished list
  // reads D1 alone, so this row proves the transfer was archived and the match marked finished.
  await page.goto('/en/sparring/matches/finished/')
  await expect(page.getByRole('link', { name: /Race Alice/ })).toContainText(
    /Race Alice\s*\/2\s*2\s*Race Bob\s*\/2\s*0\s*Finished/,
  )

  await page.goto(`${path}protocol/`)
  // Each frame opens with its breaker's Break-off and closes with the match score after it.
  const rows = page.getByRole('listitem')
  await expect(rows.filter({ hasText: 'Break-off' })).toHaveText([
    /Race Alice: Break-off$/,
    /Race Bob: Break-off$/,
  ])
  await expect(rows.filter({ hasText: /Frame \d — / })).toHaveText([
    /Race Alice 1\s*:\s*Race Bob 0\s*Frame 1 — Race Alice/,
    /Race Alice 2\s*:\s*Race Bob 0\s*Frame 2 — Race Alice/,
  ])
})

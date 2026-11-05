import { command, createMatch, expect, openPage, returnHints, test, traffic } from './browser'

// Browser layout emulation exercises Popover and Drawer, not an iOS device or touch gestures.
const viewports = [
  { label: 'desktop', width: 1024, height: 800 },
  { label: 'narrow', width: 390, height: 844 },
]

for (const viewport of viewports) {
  test(`overflow keyboard dismissal restores a usable trigger on ${viewport.label}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const path = await createMatch(request, `Keyboard ${viewport.label}`)
    await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
    const reads = traffic(page)
    await openPage(page, path)
    // Unlike the stale-observer case, dismissal should use normal browser tasks and transitions.
    await page.clock.resume()
    const trigger = page.getByRole('button', { name: 'Other actions', exact: true })
    const menu = page.getByRole('dialog', { name: 'Other actions', exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(trigger).toBeEnabled()

    // No refocus: reopening proves the restored trigger actually handles keyboard input.
    await page.keyboard.press('Space')
    await expect(menu).toBeVisible()
    const close = menu.getByRole('button', { name: 'Close', exact: true })
    await close.focus()
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    expect(reads.posts()).toHaveLength(0)
  })

  test(`an overflow action closes before its one POST commits on ${viewport.label}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const name = `Overflow ${viewport.label}`
    const path = await createMatch(request, name)
    await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
    const reads = traffic(page)
    await openPage(page, path)
    await page.clock.resume()

    let release: () => void = () => {}

    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    // Delay transport only. The POST still reaches the real Worker exactly once. Without this
    // gate, Result unmounting the whole menu could disguise a missing OverflowSheet.close().
    await page.route('**/*.data', async (route) => {
      if (route.request().method() === 'POST') await held
      await route.continue()
    })
    const menu = page.getByRole('dialog', { name: 'Other actions', exact: true })

    try {
      await page.getByRole('button', { name: 'Other actions', exact: true }).click()
      await expect(menu).toBeVisible()
      await menu
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: `Test-${name} Alice`, exact: true }) })
        .getByRole('button', { name: 'Concede frame', exact: true })
        .click()
      await expect(menu).toBeHidden()
      await expect(page.getByRole('region', { name: 'Per-game control container' })).toBeVisible()
      expect(reads.posts()).toHaveLength(1)
      release()
      await expect(page.getByText(`Test-${name} Bob won`, { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Result', exact: true })).toBeVisible()
      await reads.quiet()
      expect(reads.posts()).toHaveLength(1)
      const submitted = new URLSearchParams(reads.posts()[0]?.postData() ?? '').get('command')
      expect(submitted).toContain('"type":"frame.concede"')
      expect(submitted).toContain('"seat":"A"')

      await returnHints(page)
      await reads.quiet()
      expect(reads.posts()).toHaveLength(1)
    } finally {
      release()
    }
  })
}

test('a stale last-command correction is rejected, catches up both scores, and is never replayed', async ({
  page,
  request,
}) => {
  const path = await createMatch(request, 'Stale')
  await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  await command(request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBallCount: 4 },
  })
  await command(request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'B', pottedBallCount: 1 },
  })
  let caughtUp = 0
  let dropped = 0

  // Keep the real WS handshake/caught-up message; drop only server invalidations. openPage
  // holds the browser clock, so no watchdog or return hint can replace the old correction.
  await page.routeWebSocket('**/live/**', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      if (String(message).includes('"type":"update"')) dropped++
      else {
        if (String(message).includes('"type":"caught-up"')) caughtUp++
        socket.send(message)
      }
    })
  })
  const reads = traffic(page)
  await openPage(page, path)
  await expect.poll(() => caughtUp).toBe(1)
  const board = page.getByRole('region', { name: 'Per-game control container' })
  // The right-hand target precedes its score. Assert both seats, not a symmetric total or
  // merely the absence of an error: undoing either the old or new pot must fail this check.
  await expect(board).toContainText(/Test-Stale Alice\s*Test-Stale Bob\s*4\s*\/8\s*8\/\s*1/)
  await expect(page.getByText('Pot +1', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled()
  await command(request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'B', pottedBallCount: 2 },
  })
  await expect.poll(() => dropped).toBe(1)
  expect(reads.loaders()).toHaveLength(0)
  await expect(board).toContainText(/4\s*\/8\s*8\/\s*1/)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('This action can no longer be undone. Refresh the match.')
  await page.clock.runFor(50)
  await expect(board).toContainText(/Test-Stale Alice\s*Test-Stale Bob\s*4\s*\/8\s*8\/\s*3/)
  await expect(page.getByText('Pot +2', { exact: true })).toBeVisible()
  await reads.quiet()
  // Router's post-action read plus the controller's forced catch-up for the stale correction.
  expect(reads.loaders()).toHaveLength(2)
  expect(reads.posts()).toHaveLength(1)
  const submitted = new URLSearchParams(reads.posts()[0]?.postData() ?? '').get('command')
  expect(submitted).toContain('"type":"command.correct"')
  expect(submitted).toContain('"targetSeq":3')

  // Let committed effects run, then exercise both foreground catch-up and the HTTP watchdog.
  await page.clock.runFor(50)
  await returnHints(page)
  await page.clock.runFor(60_000)
  await reads.quiet()
  await expect(board).toContainText(/4\s*\/8\s*8\/\s*3/)
  expect(reads.posts()).toHaveLength(1)
})

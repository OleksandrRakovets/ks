import { command, createMatch, expect, openPage, returnHints, test, traffic } from './browser'

test.use({ viewport: { width: 1920, height: 1080 } })

test('the scoreboard follows live play, keeps its last state through failed reads, and empties on discard', async ({
  page,
  context,
  request,
}) => {
  const path = await createMatch(request, 'Board', { game: 'strila-v2', frames: 3, targets: [9, 9] })
  await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
  const reads = traffic(page)
  await openPage(page, `${path}scoreboard/?layout=wide`)
  const artwork = page.locator('svg[data-match-id]')
  await expect(artwork).toContainText('Board Alice0')
  const seq = Number(await artwork.getAttribute('data-seq'))

  await command(request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'A', pottedBalls: [1] },
  })
  await expect(artwork).toHaveAttribute('data-seq', String(seq + 1))
  await expect(artwork).toContainText('Board Alice2')
  await reads.quiet()
  expect(reads.loaders()).toHaveLength(1)

  // A failed read must neither reach the root error boundary nor blank the stream.
  await context.setOffline(true)
  await returnHints(page)
  await expect.poll(() => reads.loaders().length).toBeGreaterThan(1)
  await reads.quiet()
  // Failed reads back off to the watchdog instead of spinning while socket reconnects retry.
  const failedReads = reads.loaders().length
  await page.clock.runFor(30_000)
  await reads.quiet()
  expect(reads.loaders()).toHaveLength(failedReads)
  await expect(page.getByRole('heading')).toHaveCount(0)
  await expect(artwork).toHaveAttribute('data-seq', String(seq + 1))
  await expect(artwork).toContainText('Board Alice2')

  await context.setOffline(false)
  await command(request, path, {
    source: 'game',
    command: { type: 'pot.record', seat: 'B', pottedBalls: [2] },
  })
  // The watchdog retries the failed read without an operator refresh.
  await page.clock.runFor(60_000)
  await expect(artwork).toHaveAttribute('data-seq', String(seq + 2))
  await expect(artwork).toContainText('Board Bob2')

  const discard = await request.post(`${path.replace(/\/$/, '')}.data`, {
    form: { intent: 'discard' },
    maxRedirects: 0,
  })

  expect(discard.status()).toBeLessThan(400)
  await page.clock.runFor(60_000)
  await expect(artwork).not.toHaveAttribute('data-seq')
  await expect(artwork).toHaveText('')
  await expect(page.getByRole('heading')).toHaveCount(0)
})

for (const layout of ['compact', 'wide'] as const) {
  test(`the ${layout} artwork rasterizes standalone exactly as the page renders it`, async ({
    page,
    request,
  }) => {
    const path = await createMatch(request, `Canvas ${layout}`, {
      game: 'strila-v2',
      frames: 3,
      targets: [12, 9],
    })

    await command(request, path, { source: 'match', command: { type: 'frame.commence', seat: 'A' } })
    await command(request, path, {
      source: 'game',
      command: { type: 'pot.record', seat: 'A', pottedBalls: [1] },
    })
    await openPage(page, `${path}scoreboard/?layout=${layout}`)
    const artwork = page.locator('svg[data-match-id]')
    await expect(artwork).toContainText(`Canvas ${layout} Alice`)
    // A nested SVG's bounding box covers only its painted content, so clip to its full box.

    const clip = await artwork.evaluate((svg: SVGSVGElement) => {
      const matrix = svg.getScreenCTM()

      if (!matrix) throw new Error('Scoreboard artwork is not rendered')

      return { x: matrix.e, y: matrix.f, width: svg.width.baseVal.value, height: svg.height.baseVal.value }
    })

    const screenshot = await page.screenshot({ clip, omitBackground: true })

    // Draws the serialized SVG as an image, which loads no external resources, and compares it
    // with the page's own pixels.
    const result = await page.evaluate(async (png) => {
      const svg = document.querySelector('svg[data-match-id]')

      if (!(svg instanceof SVGSVGElement)) throw new Error('Missing scoreboard artwork')
      const width = svg.width.baseVal.value
      const height = svg.height.baseVal.value

      const pixels = async (src: string) => {
        const image = new Image()
        image.src = src
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')

        if (!context) throw new Error('No 2D canvas')
        context.drawImage(image, 0, 0, width, height)

        return context.getImageData(0, 0, width, height).data
      }

      const serialized = new XMLSerializer().serializeToString(svg)
      const drawn = await pixels(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`)
      const page = await pixels(`data:image/png;base64,${png}`)
      let different = 0
      let painted = 0

      for (let index = 0; index < drawn.length; index += 4) {
        if ((drawn[index + 3] ?? 0) > 0) painted++

        for (let channel = 0; channel < 4; channel++) {
          if (Math.abs((drawn[index + channel] ?? 0) - (page[index + channel] ?? 0)) > 48) {
            different++
            break
          }
        }
      }

      return { painted: painted / (width * height), different: different / (width * height) }
    }, screenshot.toString('base64'))

    expect(result.painted).toBeGreaterThan(0.3)
    expect(result.different).toBeLessThan(0.002)
  })
}

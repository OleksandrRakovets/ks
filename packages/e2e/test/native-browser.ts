import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { chromium } from '@playwright/test'
import { expect } from 'vitest'

declare global {
  interface Window {
    e2eLifecycle: {
      token: string
      ticks: number
      events: { type: string; trusted: boolean; persisted: boolean; visibility: DocumentVisibilityState }[]
    }
  }
}

/**
 * Launches versioned Chromium without Playwright's focus emulation or BFCache-disabling flags.
 * Attaches with the public noDefaults option, using its existing default context. Creating a
 * new context would restore Playwright defaults and defeat native visibility/freeze behavior.
 * The Node test keeps running when the page freezes; no timer mocks are installed here.
 */
export async function nativeBrowser() {
  const profile = await mkdtemp(resolve(tmpdir(), 'ks-native-browser-'))

  const process = spawn(
    chromium.executablePath(),
    [
      '--headless=new',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const exited = once(process, 'exit')

  try {
    const portFile = resolve(profile, 'DevToolsActivePort')
    await expect.poll(async () => readFile(portFile, 'utf8').catch(() => ''), { timeout: 10_000 }).not.toBe('')
    const [port] = (await readFile(portFile, 'utf8')).trim().split('\n')

    if (port === undefined) throw new Error('Chromium did not publish its debugging port')
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true })
    const context = browser.contexts()[0]

    if (context === undefined) throw new Error('Chromium did not expose its default context')
    const page = await context.newPage()
    await page.addInitScript(() => {
      window.e2eLifecycle = { token: crypto.randomUUID(), ticks: 0, events: [] }

      for (const type of ['pageshow', 'pagehide', 'visibilitychange', 'freeze', 'resume']) {
        const target = ['visibilitychange', 'freeze', 'resume'].includes(type) ? document : window
        target.addEventListener(type, (event) => {
          window.e2eLifecycle.events.push({
            type: event.type,
            trusted: event.isTrusted,
            persisted: event instanceof PageTransitionEvent && event.persisted,
            visibility: document.visibilityState,
          })
        })
      }

      window.setInterval(() => {
        window.e2eLifecycle.ticks++
      }, 20)
    })

    return {
      browser,
      context,
      page,
      close: async () => {
        const session = await browser.newBrowserCDPSession()
        await session.send('Browser.close')
        await exited
        await browser.close()
        await rm(profile, { recursive: true, force: true })
      },
    }
  } catch (error) {
    process.kill()
    await exited
    await rm(profile, { recursive: true, force: true })
    throw error
  }
}

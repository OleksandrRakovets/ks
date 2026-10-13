import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { type Browser, chromium, expect } from '@playwright/test'

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

  // A failed spawn emits error and then close, not exit. Observe error immediately and make
  // the completion promise non-rejecting so port discovery cannot leave an unhandled rejection.
  let spawnError: Error | undefined
  process.once('error', (error) => {
    spawnError = error
  })

  const exited = new Promise<void>((complete) => {
    process.once('close', () => complete())
  })

  let browser: Browser | undefined
  let closing: Promise<void> | undefined

  /**
   * Idempotently releases this helper's owned browser process and temporary profile.
   * CDP is best-effort: a crashed/disconnected client must not prevent process cleanup. A
   * bounded graceful attempt falls back to signals; the profile is removed only after exit.
   */
  const close = () => {
    closing ??= (async () => {
      try {
        if (browser?.isConnected() === true) {
          const graceful = browser.newBrowserCDPSession().then((session) => session.send('Browser.close'))
          await Promise.race([graceful.catch(() => undefined), delay(1_000)])
          await Promise.race([exited, delay(1_000)])
        }

        if (process.pid !== undefined && process.exitCode === null && process.signalCode === null) {
          process.kill('SIGTERM')
          const terminated = await Promise.race([exited.then(() => true), delay(1_000, false)])

          if (!terminated) process.kill('SIGKILL')
        }

        await exited
      } finally {
        // Do not remove a profile underneath a still-running browser. Disconnecting the
        // Playwright client happens after the owned child has terminated.
        if (process.pid === undefined || process.exitCode !== null || process.signalCode !== null) {
          try {
            await browser?.close()
          } finally {
            // Chromium subprocesses may finish profile writes just after the main child closes.
            // Bound transient ENOTEMPTY/EBUSY retries; persistent cleanup errors still fail.
            await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
          }
        }
      }
    })()

    return closing
  }

  try {
    const portFile = resolve(profile, 'DevToolsActivePort')
    await expect.poll(async () => readFile(portFile, 'utf8').catch(() => ''), { timeout: 10_000 }).not.toBe('')

    if (spawnError !== undefined) throw spawnError
    const [port] = (await readFile(portFile, 'utf8')).trim().split('\n')

    if (port === undefined) throw new Error('Chromium did not publish its debugging port')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true })
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
      close,
    }
  } catch (error) {
    const failure = spawnError ?? error

    try {
      await close()
    } catch (cleanupError) {
      throw new AggregateError([failure, cleanupError], 'Native Chromium launch and cleanup failed')
    }

    throw failure
  }
}

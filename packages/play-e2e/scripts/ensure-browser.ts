// Installs the lockfile's Playwright browser on first use, then its host libraries if missing.
// Browser setup is deliberately deferred to the delivery review instead of orb provisioning.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

import { chromium, webkit } from '@playwright/test'

const name = process.argv[2]

if (name !== 'chromium' && name !== 'webkit') throw new Error('Usage: ensure-browser.ts chromium|webkit')

const engine = name === 'webkit' ? webkit : chromium

const cli = resolve(import.meta.dirname, '../node_modules/.bin/playwright')

// A cached browser makes this a fast no-op.
execFileSync(cli, ['install', name], { stdio: 'inherit' })

try {
  await (await engine.launch()).close()
} catch (error) {
  console.warn(`${name} cannot launch; installing its system libraries with sudo.`)

  try {
    execFileSync('sudo', ['-n', cli, 'install-deps', name], { stdio: 'inherit' })
  } catch (installError) {
    throw new AggregateError(
      [error, installError],
      `Run \`sudo ${cli} install-deps ${name}\` once on this machine, then retry.`,
    )
  }

  await (await engine.launch()).close()
}

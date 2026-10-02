import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { preview, type PreviewServer } from 'vite'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    baseURL: string
    statePath: string
  }
}

/**
 * Serves the actual production Worker, assets, D1 adapters, and MatchRoom. Turbo builds Play
 * first. Only local migrations run, against a fresh OS temp directory with no seeded matches.
 * Wrangler and the Cloudflare Vite plugin both append /v3 to this same persistence base.
 *
 * Global setup stays outside the browser and Vitest test worker. Closing preview disposes
 * Miniflare before deleting SQLite files; failure during setup follows the same cleanup path.
 */
export default async function setup(project: TestProject) {
  const appRoot = resolve(import.meta.dirname, '../../../worker/play')
  const statePath = await mkdtemp(resolve(tmpdir(), 'ks-e2e-'))
  const previousStatePath = process.env.KS_E2E_STATE_PATH
  process.env.KS_E2E_STATE_PATH = statePath
  let server: PreviewServer | undefined

  const cleanup = async () => {
    try {
      await server?.close()
      // A failed shutdown deliberately leaves the store intact: deleting files underneath
      // an open Miniflare instance would turn a cleanup failure into data corruption.
      await rm(statePath, { recursive: true, force: true })
    } finally {
      if (previousStatePath === undefined) delete process.env.KS_E2E_STATE_PATH
      else process.env.KS_E2E_STATE_PATH = previousStatePath
    }
  }

  try {
    await new Promise<void>((complete, reject) => {
      execFile(
        'node',
        [
          resolve(import.meta.dirname, '../node_modules/wrangler/bin/wrangler.js'),
          'd1',
          'migrations',
          'apply',
          'DB',
          '--local',
          '--persist-to',
          statePath,
          '--config',
          resolve(appRoot, 'build/server/wrangler.json'),
        ],
        { env: { ...process.env, CI: 'true' } },
        (error, stdout, stderr) => {
          if (error !== null)
            reject(new Error(`Local E2E migrations failed: ${stdout}\n${stderr}`, { cause: error }))
          else complete()
        },
      )
    })
    server = await preview({
      root: appRoot,
      configFile: resolve(appRoot, 'vite.config.ts'),
      logLevel: 'silent',
      preview: { host: '127.0.0.1', port: 0, strictPort: false },
    })
    const address = server.httpServer.address()

    // Node exposes a Unix-socket/string alternative; this preview explicitly binds TCP.
    // eslint-disable-next-line anti-slop/no-runtime-typeof
    if (address === null || typeof address === 'string') throw new Error('E2E preview has no TCP address')
    project.provide('baseURL', `http://127.0.0.1:${address.port}`)
    project.provide('statePath', statePath)
  } catch (error) {
    try {
      await cleanup()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'E2E preview startup and cleanup failed')
    }

    throw error
  }

  return cleanup
}

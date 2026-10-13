import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { preview, type PreviewServer } from 'vite'

export interface E2EServer {
  readonly baseURL: string
  close(): Promise<void>
}

/**
 * Serves the actual production Worker, assets, D1 adapters, and MatchRoom from Play's current
 * build. Only local migrations run, against a fresh OS temp directory with no seeded matches.
 * Wrangler and the Cloudflare Vite plugin both append /v3 to this same persistence base, so
 * the developer's `.wrangler` state is never read or written.
 *
 * Play's Vite config reads KS_E2E_STATE_PATH while preview loads it; the variable is restored
 * once the server listens, so several servers may run in one process. Closing preview disposes
 * Miniflare before deleting SQLite files; failure during startup follows the same cleanup path.
 */
export async function startServer(): Promise<E2EServer> {
  const appRoot = resolve(import.meta.dirname, '../../../worker/play')
  const statePath = await mkdtemp(resolve(tmpdir(), 'ks-e2e-'))
  let server: PreviewServer | undefined

  const close = async () => {
    await server?.close()
    // A failed shutdown deliberately leaves the store intact: deleting files underneath
    // an open Miniflare instance would turn a cleanup failure into data corruption.
    await rm(statePath, { recursive: true, force: true })
  }

  try {
    await migrate(appRoot, statePath)
    server = await withStatePath(statePath, async () =>
      preview({
        root: appRoot,
        configFile: resolve(appRoot, 'vite.config.ts'),
        logLevel: 'silent',
        preview: { host: '127.0.0.1', port: 0, strictPort: false },
      }),
    )
    const address = server.httpServer.address()

    // Node exposes a Unix-socket/string alternative; this preview explicitly binds TCP.
    // eslint-disable-next-line anti-slop/no-runtime-typeof
    if (address === null || typeof address === 'string') throw new Error('E2E preview has no TCP address')

    return { baseURL: `http://127.0.0.1:${address.port}`, close }
  } catch (error) {
    try {
      await close()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'E2E preview startup and cleanup failed')
    }

    throw error
  }
}

async function migrate(appRoot: string, statePath: string) {
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
}

async function withStatePath<T>(statePath: string, start: () => Promise<T>) {
  const previous = process.env.KS_E2E_STATE_PATH
  process.env.KS_E2E_STATE_PATH = statePath

  try {
    return await start()
  } finally {
    if (previous === undefined) delete process.env.KS_E2E_STATE_PATH
    else process.env.KS_E2E_STATE_PATH = previous
  }
}

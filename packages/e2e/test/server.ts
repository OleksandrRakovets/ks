import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export interface E2EServer {
  readonly baseURL: string
  close(): Promise<void>
}

const wrangler = resolve(import.meta.dirname, '../node_modules/wrangler/bin/wrangler.js')

// Play's build emits the deploy configuration next to its bundle; Turbo builds Play first.
const buildConfig = resolve(import.meta.dirname, '../../../worker/play/build/server/wrangler.json')

/**
 * Serves Play's built bundle and assets with `wrangler dev`, exactly as a deploy uploads them,
 * including D1 adapters, MatchRoom, and WebSockets. Migrations and the server share one fresh
 * OS temp directory through `--persist-to`, so the developer's `.wrangler` state is never read
 * or written. Each server is its own process group; closing it stops Wrangler and its workerd
 * children before deleting their SQLite files.
 */
export async function startServer(): Promise<E2EServer> {
  const statePath = await mkdtemp(resolve(tmpdir(), 'ks-e2e-'))
  let server: ChildProcess | undefined

  const close = async () => {
    if (server !== undefined) await stop(server)
    await rm(statePath, { recursive: true, force: true })
  }

  try {
    await run([
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--persist-to',
      statePath,
      '--config',
      buildConfig,
    ])
    const port = await freePort()
    const output: string[] = []
    // Detached: the group id lets teardown stop workerd children that Wrangler spawns.
    server = spawn(
      'node',
      [
        wrangler,
        'dev',
        '--config',
        buildConfig,
        '--no-bundle',
        '--local',
        '--persist-to',
        statePath,
        '--ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--inspector-port',
        '0',
        '--show-interactive-dev-session=false',
      ],
      {
        cwd: statePath,
        detached: true,
        env: { ...process.env, CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    const record = (chunk: Buffer) => {
      output.push(chunk.toString())
    }

    server.stdout?.on('data', record)
    server.stderr?.on('data', record)
    const baseURL = `http://127.0.0.1:${port}`
    await ready(server, baseURL, output)

    return { baseURL, close }
  } catch (error) {
    try {
      await close()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'E2E server startup and cleanup failed')
    }

    throw error
  }
}

async function run(args: string[]) {
  await new Promise<void>((complete, reject) => {
    execFile('node', [wrangler, ...args], { env: { ...process.env, CI: 'true' } }, (error, stdout, stderr) => {
      if (error !== null)
        reject(new Error(`wrangler ${args[0]} failed: ${stdout}\n${stderr}`, { cause: error }))
      else complete()
    })
  })
}

/** Lets the OS choose a free loopback port. Wrangler binds it moments later. */
async function freePort() {
  return new Promise<number>((complete, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      // Node exposes a Unix-socket/string alternative; this probe explicitly binds TCP.
      // eslint-disable-next-line anti-slop/no-runtime-typeof
      const port = address !== null && typeof address === 'object' ? address.port : undefined
      probe.close(() =>
        port === undefined ? reject(new Error('Port probe has no TCP address')) : complete(port),
      )
    })
  })
}

/** Waits until the Worker answers a real route, failing early if Wrangler exits. */
async function ready(server: ChildProcess, baseURL: string, output: readonly string[]) {
  const deadline = Date.now() + 60_000

  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error(`wrangler dev exited before serving:\n${output.join('')}`)

    try {
      if ((await fetch(`${baseURL}/en/`)).ok) return
    } catch {
      // Not listening yet.
    }

    await delay(100)
  }

  throw new Error(`wrangler dev did not serve ${baseURL} within 60s:\n${output.join('')}`)
}

async function stop(server: ChildProcess) {
  if (server.pid === undefined || server.exitCode !== null || server.signalCode !== null) return

  const exited = new Promise<void>((complete) => {
    server.once('exit', () => complete())
  })

  process.kill(-server.pid, 'SIGTERM')

  if (!(await Promise.race([exited.then(() => true), delay(5_000, false)]))) {
    process.kill(-server.pid, 'SIGKILL')
    await exited
  }
}

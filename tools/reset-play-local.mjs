import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

// Play's local data only: its D1 databases and the MatchRoom namespace (Miniflare names it
// `<worker>-<class>`; the Worker is `ks`). Cache, logs, traces, and other apps' state stay.
const PLAY_STORAGE_DIRECTORIES = [
  'worker/play/.wrangler/state/v3/d1',
  'worker/play/.wrangler/state/v3/do/ks-MatchRoom',
]

for (const directory of PLAY_STORAGE_DIRECTORIES) {
  rmSync(join(ROOT, directory), { force: true, recursive: true })
}

for (const command of ['db:migrate:local', 'db:seed:local']) {
  const result = spawnSync(process.execPath, ['run', command], {
    cwd: join(ROOT, 'packages/application'),
    stdio: 'inherit',
  })

  if (result.error) throw result.error

  if (result.status !== 0) process.exit(result.status ?? 1)
}

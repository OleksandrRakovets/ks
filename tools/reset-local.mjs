import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

const WRANGLER_DIRECTORIES = ['apps/play/.wrangler', 'do/match-room/.wrangler']

for (const directory of WRANGLER_DIRECTORIES) {
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

import { spawnSync } from 'node:child_process'
import { globSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const [migrationsDirectory, ...args] = process.argv.slice(2)

if (!migrationsDirectory)
  throw new Error('Expected a migration directory followed by Drizzle generate arguments')

const require = createRequire(resolve('package.json'))

// Drizzle Kit does not export its executable; resolve it beside the caller's installed package entry.
const executable = resolve(dirname(require.resolve('drizzle-kit')), 'bin.cjs')

const result = spawnSync(executable, ['generate', ...args], {
  stdio: 'inherit',
})

if (result.error) throw result.error

if (result.status !== 0) process.exit(result.status ?? 1)

for (const path of globSync(`${migrationsDirectory}/*/snapshot.json`)) {
  const original = readFileSync(path, 'utf8')
  const minified = `${JSON.stringify(JSON.parse(original))}\n`

  if (original !== minified) writeFileSync(path, minified)
}

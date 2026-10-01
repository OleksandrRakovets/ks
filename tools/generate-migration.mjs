import { spawnSync } from 'node:child_process'
import { globSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [migrationsDirectory, ...args] = process.argv.slice(2)

if (!migrationsDirectory)
  throw new Error('Expected a migration directory followed by Drizzle generate arguments')

const result = spawnSync(resolve('node_modules/.bin/drizzle-kit'), ['generate', ...args], {
  stdio: 'inherit',
})

if (result.error) throw result.error

if (result.status !== 0) process.exit(result.status ?? 1)

for (const path of globSync(`${migrationsDirectory}/*/snapshot.json`)) {
  const original = readFileSync(path, 'utf8')
  const minified = `${JSON.stringify(JSON.parse(original))}\n`

  if (original !== minified) writeFileSync(path, minified)
}

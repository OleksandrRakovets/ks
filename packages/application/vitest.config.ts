import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const migrationsRoot = resolve(import.meta.dirname, '../../d1/migrations')

const migrationDirectories = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

const migrations = (
  await Promise.all(
    migrationDirectories.map(async (directory) =>
      (await readD1Migrations(resolve(migrationsRoot, directory))).map((migration) => ({
        ...migration,
        name: `${directory}_${migration.name}`,
      })),
    ),
  )
).flat()

if (migrations.length === 0) throw new Error(`No D1 migrations found under ${migrationsRoot}`)

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2026-08-11',
        d1Databases: ['DB'],
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    include: ['test/**/*.integration.test.ts'],
  },
})

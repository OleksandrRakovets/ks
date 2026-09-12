import { defineConfig } from 'drizzle-kit'

const localDatabaseUrl = process.env.KS_D1_LOCAL_URL

const config = {
  dialect: 'sqlite',
  schema: 'packages/application/src/d1/schema.ts',
  out: 'd1/migrations',
} as const

export default localDatabaseUrl !== undefined && localDatabaseUrl.length > 0
  ? defineConfig({ ...config, dbCredentials: { url: localDatabaseUrl } })
  : defineConfig(config)

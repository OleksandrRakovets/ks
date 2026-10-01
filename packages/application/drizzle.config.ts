import { defineConfig } from 'drizzle-kit'

const localDatabaseUrl = process.env.KS_D1_LOCAL_URL

const config = {
  dialect: 'sqlite',
  schema: './src/d1/schema.ts',
  out: './drizzle',
} as const

export default localDatabaseUrl !== undefined && localDatabaseUrl.length > 0
  ? defineConfig({ ...config, dbCredentials: { url: localDatabaseUrl } })
  : defineConfig(config)

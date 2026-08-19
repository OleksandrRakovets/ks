import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: 'packages/application/src/d1/schema.ts',
  out: 'd1/migrations',
})

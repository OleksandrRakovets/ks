import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  driver: 'durable-sqlite',
  schema: 'do/match-room/src/storage/schema.ts',
  out: 'do/match-room/drizzle',
})

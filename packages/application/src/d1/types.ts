import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'

export function createApplicationDatabase(client: D1Database) {
  return drizzle(client)
}

export type ApplicationDatabase = ReturnType<typeof createApplicationDatabase>

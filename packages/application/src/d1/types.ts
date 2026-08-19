import type { D1Database } from '@cloudflare/workers-types'

export type ApplicationDatabase = Pick<D1Database, 'prepare'>

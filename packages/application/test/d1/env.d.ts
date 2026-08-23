import type { D1Database, D1Migration } from '@cloudflare/workers-types'

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}

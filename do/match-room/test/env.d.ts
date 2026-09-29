import type { MatchRoom } from '../src/MatchRoom'

declare global {
  namespace Cloudflare {
    interface Env {
      MATCH_ROOM: DurableObjectNamespace<MatchRoom>
    }
  }
}

export {}

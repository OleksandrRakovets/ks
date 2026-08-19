import type { MatchRoom } from '@ks/match-room'

export type Env = {
  DB: D1Database
  MATCH_ROOM: DurableObjectNamespace<MatchRoom>
  ADMIN_USER: string
  ADMIN_PASS: string
  KS_DEPLOY_ENV?: string
}

export type Env = {
  DB: D1Database
  MATCH_ROOM: DurableObjectNamespace
  ADMIN_USER: string
  ADMIN_PASS: string
  KS_DEPLOY_ENV?: string
}

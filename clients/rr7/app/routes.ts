import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/index.tsx'),
  route('favicon.ico', 'routes/favicon.ts'),
  route('admin/create', 'routes/admin-create.tsx'),
  route('c/:matchId/:controlSecret', 'routes/control-match.tsx'),
  route('m/:matchId', 'routes/public-scoreboard.tsx'),
  route('api/admin/matches', 'routes/api.admin.matches.ts'),
  route('api/matches/:matchId', 'routes/api.matches.$matchId.ts'),
  route('api/matches/:matchId/events', 'routes/api.matches.$matchId.events.ts'),
  route('api/matches/:matchId/stream', 'routes/api.matches.$matchId.stream.ts'),
] satisfies RouteConfig

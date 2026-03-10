import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/index.tsx'),
  route('favicon.ico', 'routes/favicon.ts'),
  route('admin/create', 'routes/admin-create.tsx'),
  route('c/:matchId/:controlSecret', 'routes/control-match.tsx'),
  route('m/:matchId', 'routes/public-scoreboard.tsx'),
] satisfies RouteConfig

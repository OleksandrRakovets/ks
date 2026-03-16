import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  route('favicon.ico', 'routes/favicon.ts'),
  route('api/m/:matchId/stream', 'routes/api-match-stream.ts'),
  layout('routes/layout-base.tsx', [
    index('routes/index.tsx'),
    route('admin/create', 'routes/admin-create.tsx'),
    route('top-secret/preview/ui', 'routes/top-secret-preview-ui.tsx'),
    route('c/:matchId/:controlSecret', 'routes/control-match.tsx'),
  ]),
  layout('routes/layout-scoreboard.tsx', [route('m/:matchId', 'routes/public-scoreboard.tsx')]),
] satisfies RouteConfig

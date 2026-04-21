import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  route('favicon.ico', 'routes/tech/favicon.ts'),
  route('robots.txt', 'routes/tech/robots-txt.ts'),
  route('api/m/:matchId/stream', 'routes/api-match-stream.ts'),
  route('api/theme', 'routes/api-theme.ts'),
  layout('routes/layout-base.tsx', [
    index('routes/index.tsx'),
    route('sparring', 'routes/sparring.tsx'),
    route('sparring/init/:gameKey', 'routes/sparring-init.tsx'),
    route('sparring/matches', 'routes/sparring-matches.tsx'),
    route('sparring/matches/:matchId', 'routes/sparring-match.tsx'),
    route('top-secret/preview', 'preview/index.tsx'),
    route('top-secret/preview/ui', 'preview/ui.tsx'),
    route('top-secret/preview/game-state', 'preview/game-state-index.tsx'),
    route('top-secret/preview/game-state/:gameKey', 'preview/game-state-detail.tsx'),
  ]),
  // layout('routes/layout-scoreboard.tsx', [route('m/:matchId', 'routes/public-scoreboard.tsx')]),
] satisfies RouteConfig

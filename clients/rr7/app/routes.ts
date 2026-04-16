import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  route('favicon.ico', 'routes/favicon.ts'),
  route('api/m/:matchId/stream', 'routes/api-match-stream.ts'),
  layout('routes/layout-base.tsx', [
    index('routes/index.tsx'),
    route('sparring', 'routes/sparring.tsx'),
    route('sparring/init/:gameKey', 'routes/sparring-init.tsx'),
    route('sparring/matches', 'routes/sparring-matches.tsx'),
    route('sparring/matches/:matchId', 'routes/sparring-match.tsx'),
    route('top-secret/preview', 'routes/preview/index.tsx'),
    route('top-secret/preview/ui', 'routes/preview/ui.tsx'),
    route('top-secret/preview/game-state', 'routes/preview/game-state-index.tsx'),
    route('top-secret/preview/game-state/:gameKey', 'routes/preview/game-state-detail.tsx'),
  ]),
  // layout('routes/layout-scoreboard.tsx', [route('m/:matchId', 'routes/public-scoreboard.tsx')]),
] satisfies RouteConfig

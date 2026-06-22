import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  route('favicon.ico', 'routes/tech/favicon.ts'),
  route('site.webmanifest', 'routes/tech/site-webmanifest.ts'),
  route('robots.txt', 'routes/tech/robots-txt.ts'),
  route('api/m/:matchId/stream', 'routes/api-match-stream.ts'),
  route('ui-preferences/:preference', 'routes/ui-preferences.ts'),
  layout('routes/layout-base.tsx', [
    index('routes/index.tsx'),
    route('sparring', 'routes/sparring.tsx'),
    route('sparring/init/:gameKey', 'routes/sparring-init/route.tsx'),
    route('sparring/matches', 'routes/sparring-matches.tsx'),
    route('sparring/matches/:matchId', 'routes/sparring-match/route-control.tsx'),
    route('sparring/matches/:matchId/protocol', 'routes/sparring-match/route-protocol.tsx'),
    route('top-secret/preview', 'preview/index.tsx'),
    route('top-secret/preview/ui', 'preview/ui.tsx'),
  ]),
  // layout('routes/layout-scoreboard.tsx', [route('m/:matchId', 'routes/public-scoreboard.tsx')]),
] satisfies RouteConfig

import { index, layout, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  route('favicon.ico', 'routes/tech/favicon.ts'),
  route('apple-touch-icon.png', 'routes/tech/apple-touch-icon.ts'),
  route('apple-touch-icon-precomposed.png', 'routes/tech/apple-touch-icon-precomposed.ts'),
  route('site.webmanifest', 'routes/tech/site-webmanifest.ts'),
  route('robots.txt', 'routes/tech/robots-txt.ts'),
  route('api/m/:matchId/stream/', 'routes/api-match-stream.ts'),
  route('ui-preferences/theme/', 'routes/ui-preferences.ts'),
  route('en?', 'routes/layout-base.tsx', [
    index('routes/index.tsx'),
    layout('routes/layout-construction.tsx', [
      route('sparring/', 'routes/sparring.tsx'),
      route('sparring/init/:gameKey/', 'routes/sparring-init/route.tsx'),
      route('sparring/matches/', 'routes/sparring-matches.tsx'),
    ]),
    route('match/strila-v2/:matchId/control/', 'routes/match/strila-v2-control.tsx'),
    route('match/strila-v2/:matchId/protocol/', 'routes/match/strila-v2-protocol.tsx'),
    route('match/free-pyramid/:matchId/control/', 'routes/match/free-pyramid-control.tsx'),
    route('match/free-pyramid/:matchId/protocol/', 'routes/match/free-pyramid-protocol.tsx'),
    route('match/free-pyramid-long/:matchId/control/', 'routes/match/free-pyramid-long-control.tsx'),
    route('match/free-pyramid-long/:matchId/protocol/', 'routes/match/free-pyramid-long-protocol.tsx'),
    route('match/combined-pyramid/:matchId/control/', 'routes/match/combined-pyramid-control.tsx'),
    route('match/combined-pyramid/:matchId/protocol/', 'routes/match/combined-pyramid-protocol.tsx'),
    route('match/combined-pyramid-old/:matchId/control/', 'routes/match/combined-pyramid-old-control.tsx'),
    route('match/combined-pyramid-old/:matchId/protocol/', 'routes/match/combined-pyramid-old-protocol.tsx'),
    route('top-secret/preview/', 'preview/index.tsx'),
    route('top-secret/preview/ui/', 'preview/ui.tsx'),
  ]),
] satisfies RouteConfig

import { index, layout, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  route('favicon.ico', 'routes/tech/favicon.ts'),
  route('apple-touch-icon.png', 'routes/tech/apple-touch-icon.ts'),
  route('apple-touch-icon-precomposed.png', 'routes/tech/apple-touch-icon-precomposed.ts'),
  route('site.webmanifest', 'routes/tech/site-webmanifest.ts'),
  route('robots.txt', 'routes/tech/robots-txt.ts'),
  route('ui-preferences/theme/', 'routes/ui-preferences.ts'),
  route('api/sparring-matches/live-scores/', 'routes/sparring/matches/api-live-scores.ts'),
  route('en?', 'routes/layout-base.tsx', [
    index('routes/index.tsx'),
    layout('routes/layout-app.tsx', [
      route('sparring/', 'routes/sparring/index.tsx'),
      route('sparring/setup/:gameKey/', 'routes/sparring/setup/route.tsx'),
      route('sparring/matches/', 'routes/sparring/matches/live.tsx'),
      route('sparring/matches/finished/:day?/', 'routes/sparring/matches/finished.tsx'),
    ]),
    route('sparring/match/strila-v2/:matchId/', 'routes/sparring/match/strila-v2-match.tsx'),
    route('sparring/match/strila-v2/:matchId/protocol/', 'routes/sparring/match/strila-v2-protocol.tsx'),
    route('sparring/match/free-pyramid/:matchId/', 'routes/sparring/match/free-pyramid-match.tsx'),
    route('sparring/match/free-pyramid/:matchId/protocol/', 'routes/sparring/match/free-pyramid-protocol.tsx'),
    route('sparring/match/free-pyramid-long/:matchId/', 'routes/sparring/match/free-pyramid-long-match.tsx'),
    route(
      'sparring/match/free-pyramid-long/:matchId/protocol/',
      'routes/sparring/match/free-pyramid-long-protocol.tsx',
    ),
    route('sparring/match/combined-pyramid/:matchId/', 'routes/sparring/match/combined-pyramid-match.tsx'),
    route(
      'sparring/match/combined-pyramid/:matchId/protocol/',
      'routes/sparring/match/combined-pyramid-protocol.tsx',
    ),
    route(
      'sparring/match/combined-pyramid-old/:matchId/',
      'routes/sparring/match/combined-pyramid-old-match.tsx',
    ),
    route(
      'sparring/match/combined-pyramid-old/:matchId/protocol/',
      'routes/sparring/match/combined-pyramid-old-protocol.tsx',
    ),
    route('top-secret/preview/', 'routes/preview/index.tsx'),
    route('top-secret/preview/ui/', 'routes/preview/ui.tsx'),
  ]),
] satisfies RouteConfig

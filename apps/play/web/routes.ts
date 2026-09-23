import { index, layout, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  route('favicon.ico', 'routes/tech/favicon.ts'),
  route('apple-touch-icon.png', 'routes/tech/apple-touch-icon.ts'),
  route('apple-touch-icon-precomposed.png', 'routes/tech/apple-touch-icon-precomposed.ts'),
  route('site.webmanifest', 'routes/tech/site-webmanifest.ts'),
  route('robots.txt', 'routes/tech/robots-txt.ts'),
  route('ui-preferences/theme/', 'routes/ui-preferences.ts'),
  route('api/sparring-matches/scores/', 'routes/api-sparring-match-scores.ts'),
  route('en?', 'routes/layout-base.tsx', [
    index('routes/index.tsx'),
    layout('routes/layout-app.tsx', [
      route('sparring/', 'routes/sparring.tsx'),
      route('sparring/init/:gameKey/', 'routes/sparring-init/route.tsx'),
      route('sparring/matches/', 'routes/sparring-matches/live.tsx'),
      route('sparring/matches/completed/', 'routes/sparring-matches/completed.tsx'),
    ]),
    route('match/strila-v2/:matchId/', 'routes/match/strila-v2-match.tsx'),
    route('match/strila-v2/:matchId/protocol/', 'routes/match/strila-v2-protocol.tsx'),
    route('match/free-pyramid/:matchId/', 'routes/match/free-pyramid-match.tsx'),
    route('match/free-pyramid/:matchId/protocol/', 'routes/match/free-pyramid-protocol.tsx'),
    route('match/free-pyramid-long/:matchId/', 'routes/match/free-pyramid-long-match.tsx'),
    route('match/free-pyramid-long/:matchId/protocol/', 'routes/match/free-pyramid-long-protocol.tsx'),
    route('match/combined-pyramid/:matchId/', 'routes/match/combined-pyramid-match.tsx'),
    route('match/combined-pyramid/:matchId/protocol/', 'routes/match/combined-pyramid-protocol.tsx'),
    route('match/combined-pyramid-old/:matchId/', 'routes/match/combined-pyramid-old-match.tsx'),
    route('match/combined-pyramid-old/:matchId/protocol/', 'routes/match/combined-pyramid-old-protocol.tsx'),
    route('top-secret/preview/', 'preview/index.tsx'),
    route('top-secret/preview/ui/', 'preview/ui.tsx'),
  ]),
] satisfies RouteConfig

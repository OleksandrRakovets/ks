import { requireEnv } from '../server/context'
import { streamMatchFacts } from '../server/match-room'
import type { Route } from './+types/api-match-stream'

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const since = new URL(request.url).searchParams.get('since')
  return streamMatchFacts(env, matchId, since)
}

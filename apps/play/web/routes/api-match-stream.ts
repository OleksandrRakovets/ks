import { requireApplication } from '../server/context'
import type { Route } from './+types/api-match-stream'

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const application = requireApplication(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const since = new URL(request.url).searchParams.get('since')
  const parsedSince = since && since.length > 0 ? Number(since) : undefined
  return application.streamMatchFacts(matchId, Number.isFinite(parsedSince) ? parsedSince : undefined)
}

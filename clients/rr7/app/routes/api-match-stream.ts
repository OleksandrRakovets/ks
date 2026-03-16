import type { LoaderFunctionArgs } from 'react-router'

import { requireEnv } from '../server/context'
import { streamMatchEvents } from '../server/match-room'

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const env = requireEnv(context)
  const matchId = params.matchId
  if (!matchId) throw new Response('Missing matchId', { status: 400 })

  const since = new URL(request.url).searchParams.get('since')
  return streamMatchEvents(env, matchId, since)
}

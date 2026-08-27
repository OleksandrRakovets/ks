import { MatchIdSchema, NonNegativeIntegerSchema } from '@ks/core'
import * as v from 'valibot'

import { requireApplication } from '../server/context'
import type { Route } from './+types/api-match-stream'

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const matchId = v.safeParse(MatchIdSchema, params.matchId)
  if (!matchId.success) throw new Response('Invalid matchId', { status: 400 })

  const since = new URL(request.url).searchParams.get('since')
  const parsedSince =
    since && since.length > 0 ? v.safeParse(NonNegativeIntegerSchema, Number(since)) : undefined
  return requireApplication(context).streamMatchUpdates(
    matchId.output,
    parsedSince?.success ? parsedSince.output : undefined,
  )
}

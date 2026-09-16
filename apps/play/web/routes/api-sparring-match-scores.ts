import { MATCH_SCORE_POLL_MAX_MATCHES } from '@ks/application'
import { MatchId } from '@ks/core'
import * as v from 'valibot'

import { requireApplication } from '../server/context'
import type { Route } from './+types/api-sparring-match-scores'

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const values = url.searchParams.getAll('matchId')

  if (
    values.length < 1 ||
    values.length > MATCH_SCORE_POLL_MAX_MATCHES ||
    url.searchParams.size !== values.length ||
    new Set(values).size !== values.length
  )
    return Response.json({ error: 'Expected 1 to 20 unique Match IDs' }, { status: 400 })
  const matchIds = v.safeParse(v.array(MatchId), values)

  if (!matchIds.success) return Response.json({ error: 'Invalid Match ID' }, { status: 400 })
  const result = await requireApplication(context).readMatchScores(matchIds.output)

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })

  return Response.json(
    { matches: result.matches },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

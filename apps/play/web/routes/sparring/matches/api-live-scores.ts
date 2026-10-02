import { SparringService } from '@ks/application/server'
import { MatchId } from '@ks/core'
import { Effect } from 'effect'
import * as v from 'valibot'

import { applicationStorageErrorResponse } from '@/server/application-storage-error.server'
import { requireRunEffect } from '@/server/context.server'

import type { Route } from './+types/api-live-scores'

export async function loader({ request, context }: Pick<Route.LoaderArgs, 'request' | 'context'>) {
  const url = new URL(request.url)
  const values = url.searchParams.getAll('matchId')

  if (values.length < 1 || url.searchParams.size !== values.length || new Set(values).size !== values.length)
    return Response.json({ error: 'Expected unique Match IDs' }, { status: 400 })
  const matchIds = v.safeParse(v.array(MatchId), values)

  if (!matchIds.success) return Response.json({ error: 'Invalid Match ID' }, { status: 400 })

  const result = await requireRunEffect(context)(
    SparringService.use((sparring) => sparring.readMatchScores(matchIds.output)).pipe(
      Effect.catchTags({
        MatchNotFound: () => Effect.succeed(Response.json({ error: 'Unknown match' }, { status: 404 })),
        ApplicationStorageError: (error) => Effect.succeed(applicationStorageErrorResponse(error)),
      }),
    ),
  )

  if (result instanceof Response) return result

  return Response.json(
    { matches: result.matches },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

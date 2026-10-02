import { SparringService } from '@ks/application/server'
import { MatchId } from '@ks/core'
import * as v from 'valibot'

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
    SparringService.use((sparring) => sparring.readMatchScores(matchIds.output)),
  )

  if (!result.ok) {
    switch (result.reason) {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Keep the single-reason contract exhaustive.
      case 'unknown-match':
        return Response.json({ error: 'Unknown match' }, { status: 404 })
      default:
        throw new Error('Unhandled match scores failure', { cause: result.reason satisfies never })
    }
  }

  return Response.json(
    { matches: result.matches },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

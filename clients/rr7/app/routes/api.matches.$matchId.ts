import { normalizeMatchId } from '@ks/domain'

import { requireEnv } from '../server/context'
import { badRequest } from '../server/http'

import type { LoaderFunctionArgs } from 'react-router'

export async function loader({ params, context }: LoaderFunctionArgs) {
  const env = requireEnv(context)
  const rawMatchId = params.matchId
  if (!rawMatchId) {
    return badRequest('Missing matchId')
  }

  const matchId = normalizeMatchId(rawMatchId)
  const id = env.MATCH_ROOM.idFromName(matchId)
  const stub = env.MATCH_ROOM.get(id)

  return stub.fetch(
    new Request('https://do/snapshot', {
      headers: {
        'x-ks-match-id': matchId,
      },
    }),
  )
}

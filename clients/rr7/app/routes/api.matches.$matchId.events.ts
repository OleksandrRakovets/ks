import { normalizeMatchId } from '@ks/domain'

import { requireEnv } from '../server/context'
import { badRequest } from '../server/http'

import type { ActionFunctionArgs } from 'react-router'

export async function action({ params, request, context }: ActionFunctionArgs) {
  const env = requireEnv(context)
  const rawMatchId = params.matchId
  if (!rawMatchId) {
    return badRequest('Missing matchId')
  }

  const matchId = normalizeMatchId(rawMatchId)
  const id = env.MATCH_ROOM.idFromName(matchId)
  const stub = env.MATCH_ROOM.get(id)
  const headers = new Headers(request.headers)
  headers.set('x-ks-match-id', matchId)

  return stub.fetch(
    new Request('https://do/events', {
      method: request.method,
      headers,
      body: request.body,
      redirect: request.redirect,
    }),
  )
}

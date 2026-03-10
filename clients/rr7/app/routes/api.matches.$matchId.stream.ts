import { normalizeMatchId } from '@ks/domain'

import { requireEnv } from '../server/context'
import { badRequest } from '../server/http'

import type { LoaderFunctionArgs } from 'react-router'

export async function loader({ params, request, context }: LoaderFunctionArgs) {
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

  const url = new URL('https://do/stream')
  url.search = new URL(request.url).search

  return stub.fetch(
    new Request(url.toString(), {
      method: request.method,
      headers,
      redirect: request.redirect,
    }),
  )
}

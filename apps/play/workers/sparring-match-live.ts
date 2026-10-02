import { SparringService } from '@ks/application/server'
import { MatchId, SparringMatchLiveQuery } from '@ks/core'
import { Effect } from 'effect'
import * as v from 'valibot'

import { applicationStorageErrorResponse } from '../web/server/application-storage-error.server'
import type { RunEffect } from '../web/server/context.server'

const path = /^\/api\/sparring-match\/([^/]+)\/live\/$/

export async function handleSparringMatchLiveRequest(
  request: Request,
  env: Cloudflare.Env,
  runEffect: RunEffect,
): Promise<Response | null> {
  const url = new URL(request.url)

  if (!url.pathname.startsWith('/api/sparring-match/')) return null

  const match = path.exec(url.pathname)

  if (!match) return new Response('Invalid live path', { status: 400 })

  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  const matchId = v.safeParse(MatchId, match[1])
  const query = v.safeParse(SparringMatchLiveQuery, Object.fromEntries(url.searchParams))

  if (
    !matchId.success ||
    !query.success ||
    request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
    url.searchParams.size !== 2
  )
    return new Response('Invalid live request', { status: 400 })

  const admission = await runEffect(
    SparringService.use((sparring) => sparring.admitMatchLive(matchId.output)).pipe(
      Effect.catchTags({
        MatchNotFound: () => Effect.succeed(new Response('Unknown match', { status: 404 })),
        MatchFinished: () => Effect.succeed(new Response('Match is finished', { status: 410 })),
        ApplicationStorageError: (error) => Effect.succeed(applicationStorageErrorResponse(error)),
      }),
    ),
  )

  if (admission instanceof Response) return admission

  try {
    const roomUrl = new URL(`https://match-room/api/sparring-match/${matchId.output}/live/`)
    roomUrl.searchParams.set('contract', '1')
    roomUrl.searchParams.set('view', query.output.view)

    return await env.MATCH_ROOM.getByName(matchId.output).fetch(new Request(roomUrl.toString(), request))
  } catch (error) {
    console.error('Sparring Match live request failed', error)

    return new Response('Internal server error', { status: 500 })
  }
}

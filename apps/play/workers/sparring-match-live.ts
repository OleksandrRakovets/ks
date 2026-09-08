import type { Application } from '@ks/application'
import { MatchId } from '@ks/core'
import * as v from 'valibot'

import type { Env } from './env'

const path = /^\/api\/sparring-match\/([^/]+)\/live\/$/

export async function handleSparringMatchLiveRequest(
  request: Request,
  env: Env,
  application: Application,
): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/sparring-match/')) return null
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const match = path.exec(url.pathname)
  if (!match) return new Response('Invalid live path', { status: 400 })
  const matchId = v.safeParse(MatchId, match[1])
  const pageKind = url.searchParams.get('view')
  if (
    !matchId.success ||
    request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
    url.searchParams.get('contract') !== '1' ||
    (pageKind !== 'control' && pageKind !== 'protocol') ||
    url.searchParams.size !== 2
  )
    return new Response('Invalid live request', { status: 400 })

  try {
    const admission = await application.admitSparringMatchLive(matchId.output)
    if (admission._tag === 'unknown') return new Response('Unknown match', { status: 404 })
    if (admission._tag === 'finished') return new Response('Match is finished', { status: 410 })
    const roomUrl = new URL(`https://match-room/api/sparring-match/${matchId.output}/live/`)
    roomUrl.searchParams.set('contract', '1')
    roomUrl.searchParams.set('view', pageKind)
    return await env.MATCH_ROOM.getByName(matchId.output).fetch(new Request(roomUrl.toString(), request))
  } catch (error) {
    console.error('Sparring Match live admission failed', error)
    return new Response('Internal server error', { status: 500 })
  }
}

import { PlayerIdSchema, newMatchId, stripOptionalPrefix, type MatchConfig } from '@ks/core'
import { isRegisteredGameKey } from '@ks/games'
import { Hono } from 'hono'
import { z } from 'zod/v4'

import type { Env } from './env'

import { MatchRoom } from './do/MatchRoom'
import { requireBasicAuth } from './http/auth'
import { badRequest, json, unauthorized } from './http/utils'
import { insertMatch } from './repos/matches'

export { MatchRoom }

const CreateMatchBodySchema = z.object({
  gameKey: z.string().refine((value) => isRegisteredGameKey(value), 'Unsupported game key'),
  targets: z.object({
    frameTargetPointsBySeat: z.object({
      A: z.number().int().positive(),
      B: z.number().int().positive(),
    }),
    matchTargetFramesBySeat: z.object({
      A: z.number().int().positive(),
      B: z.number().int().positive(),
    }),
  }),
  participants: z
    .array(
        z.object({
          seat: z.enum(['A', 'B']),
          savedPlayerId: PlayerIdSchema.optional(),
          displayName: z.string().min(1).max(64),
        }),
    )
    .length(2),
})

function randomSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const app = new Hono<{ Bindings: Env }>()

type ForwardRequest = Pick<Request, 'headers' | 'method' | 'body' | 'redirect'>

function forwardToMatchRoom(stub: DurableObjectStub, matchId: string, url: string, req: ForwardRequest): Promise<Response> {
  const headers = new Headers(req.headers)
  headers.set('x-ks-match-id', matchId)
  return stub.fetch(
    new Request(url, {
      method: req.method,
      headers,
      body: req.body,
      redirect: req.redirect,
    }),
  )
}

app.get('/healthz', (c) => c.text('ok'))

app.post('/api/admin/matches', async (c) => {
  if (!requireBasicAuth(c.req.raw, c.env)) return unauthorized()

  const body = await c.req.json().catch(() => null)
  const parsed = CreateMatchBodySchema.safeParse(body)
  if (!parsed.success) return badRequest('Invalid create match body')

  const matchId = newMatchId()
  const controlSecret = randomSecret()
  const now = Date.now()

  const config: MatchConfig = {
    matchId,
    gameKey: parsed.data.gameKey,
    targets: parsed.data.targets,
    participants: parsed.data.participants,
  }

  await insertMatch(c.env, { matchId, controlSecret, config, now })

  const id = c.env.MATCH_ROOM.idFromName(matchId)
  const stub = c.env.MATCH_ROOM.get(id)
  await stub.fetch('https://do/internal/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ks-match-id': matchId },
    body: JSON.stringify({ controlSecret, config }),
  })

  return json({
    ok: true,
    matchId,
    publicUrl: `/m/${matchId}`,
    controlUrl: `/c/${matchId}/${controlSecret}`,
  })
})

app.get('/api/matches/:matchId', async (c) => {
  const raw = c.req.param('matchId')
  const matchId = stripOptionalPrefix(raw)
  const id = c.env.MATCH_ROOM.idFromName(matchId)
  const stub = c.env.MATCH_ROOM.get(id)
  return forwardToMatchRoom(stub, matchId, 'https://do/snapshot', c.req.raw)
})

app.post('/api/matches/:matchId/events', async (c) => {
  const raw = c.req.param('matchId')
  const matchId = stripOptionalPrefix(raw)
  const id = c.env.MATCH_ROOM.idFromName(matchId)
  const stub = c.env.MATCH_ROOM.get(id)
  return forwardToMatchRoom(stub, matchId, 'https://do/events', c.req.raw.clone())
})

app.get('/api/matches/:matchId/stream', async (c) => {
  const raw = c.req.param('matchId')
  const matchId = stripOptionalPrefix(raw)
  const id = c.env.MATCH_ROOM.idFromName(matchId)
  const stub = c.env.MATCH_ROOM.get(id)
  const url = new URL('https://do/stream')
  url.search = new URL(c.req.url).search
  return forwardToMatchRoom(stub, matchId, url.toString(), c.req.raw)
})

export default app

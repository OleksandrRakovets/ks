import { CreateMatchRequestSchema, createMatchService } from '@ks/domain'

import { requireBasicAuth } from '../server/auth'
import { requireEnv } from '../server/context'
import { badRequest, json, unauthorized } from '../server/http'

import type { ActionFunctionArgs } from 'react-router'

export async function action({ request, context }: ActionFunctionArgs) {
  const env = requireEnv(context)
  if (!requireBasicAuth(request, env)) {
    return unauthorized()
  }

  const body = await request.json().catch(() => null)
  const parsed = CreateMatchRequestSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest('Invalid create match body')
  }

  const result = await createMatchService(
    {
      insertMatch: async (args) => {
        await env.DB.prepare(
          'INSERT INTO matches (match_id, control_secret, game_key, config_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
          .bind(args.matchId, args.controlSecret, args.config.gameKey, JSON.stringify(args.config), 'active', args.now)
          .run()
      },
      initMatchRoom: async (args) => {
        const id = env.MATCH_ROOM.idFromName(args.matchId)
        const stub = env.MATCH_ROOM.get(id)
        await stub.fetch('https://do/internal/init', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-ks-match-id': args.matchId,
          },
          body: JSON.stringify({
            controlSecret: args.controlSecret,
            config: args.config,
          }),
        })
      },
    },
    parsed.data,
  )

  return json({
    ok: true,
    matchId: result.matchId,
    publicUrl: result.publicUrl,
    controlUrl: result.controlUrl,
  })
}

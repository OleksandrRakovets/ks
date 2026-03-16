import { normalizeMatchId, type MatchWriteRepository } from '@ks/competition'
import type { ClientEvent } from '@ks/core'

import type { AppEnv } from './context'

export async function fetchMatchSnapshot(env: AppEnv, rawMatchId: string): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const id = env.MATCH_ROOM.idFromName(matchId)
  const stub = env.MATCH_ROOM.get(id)
  return stub.fetch(
    new Request('https://do/snapshot', {
      headers: { 'x-ks-match-id': matchId },
    }),
  )
}

export async function postMatchEvents(
  env: AppEnv,
  rawMatchId: string,
  controlSecret: string,
  events: ClientEvent[],
): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const id = env.MATCH_ROOM.idFromName(matchId)
  const stub = env.MATCH_ROOM.get(id)
  return stub.fetch('https://do/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ks-match-id': matchId,
    },
    body: JSON.stringify({ controlSecret, events }),
  })
}

export async function streamMatchEvents(env: AppEnv, rawMatchId: string, since?: string | null): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const id = env.MATCH_ROOM.idFromName(matchId)
  const stub = env.MATCH_ROOM.get(id)
  const query = new URLSearchParams()
  if (since && since.length > 0) {
    query.set('since', since)
  }
  const target = query.size > 0 ? `https://do/stream?${query.toString()}` : 'https://do/stream'
  return stub.fetch(
    new Request(target, {
      headers: {
        accept: 'text/event-stream',
        'x-ks-match-id': matchId,
      },
    }),
  )
}

export function makeMatchWriteRepository(env: AppEnv): MatchWriteRepository {
  return {
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
  }
}

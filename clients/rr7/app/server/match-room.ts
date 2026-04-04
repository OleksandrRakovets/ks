import { normalizeMatchId, type MatchWriteRepository } from '@ks/competition'
import { MatchSnapshotSchema } from '@ks/core'
import type { SupportedLocale } from '@ks/i18n'
import type { ClientEvent } from '@ks/core'

import type { AppEnv } from './context'
import { hydrateParticipant } from './players'

export async function fetchMatchSnapshot(env: AppEnv, rawMatchId: string, locale: SupportedLocale): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const id = env.MATCH_ROOM.idFromName(matchId)
  const stub = env.MATCH_ROOM.get(id)
  const response = await stub.fetch(
    new Request('https://do/snapshot', {
      headers: { 'x-ks-match-id': matchId },
    }),
  )
  const payload = (await response.json()) as { ok?: boolean; snapshot?: unknown; error?: string }
  if (!payload.ok || !payload.snapshot) {
    return Response.json({ ok: false, error: payload.error ?? 'Failed to load snapshot' }, { status: response.status })
  }
  const snapshot = MatchSnapshotSchema.parse(payload.snapshot)

  const matchRow = await env.DB.prepare('SELECT seat_a_player_ref, seat_b_player_ref FROM matches WHERE match_id = ?')
    .bind(matchId)
    .first<{ seat_a_player_ref: string; seat_b_player_ref: string }>()
  if (!matchRow) {
    return Response.json({ ok: false, error: 'Unknown match' }, { status: 404 })
  }

  const participants = {
    A: await hydrateParticipant(env, matchRow.seat_a_player_ref, locale),
    B: await hydrateParticipant(env, matchRow.seat_b_player_ref, locale),
  }

  return Response.json({ ok: true, snapshot, participants })
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
        [
          'INSERT INTO matches (',
          'match_id, control_secret, game_key, config_json, latest_seq, seat_a_player_ref, seat_b_player_ref, status, created_at',
          ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ].join(' '),
      )
        .bind(
          args.matchId,
          args.controlSecret,
          args.config.gameKey,
          JSON.stringify(args.config),
          0,
          args.seatAPlayerRef,
          args.seatBPlayerRef,
          'active',
          args.now,
        )
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

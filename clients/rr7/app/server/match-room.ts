import { normalizeMatchId, type MatchWriteRepository } from '@ks/competition'
import { MatchSnapshotSchema, StoredEventSchema, type StoredEvent } from '@ks/core'
import type { ClientEvent } from '@ks/core'
import { isRegisteredGameKey, registry } from '@ks/gameplay'
import type { SupportedLocale } from '@ks/i18n'
import { z } from 'zod'

import type { AppEnv } from './context'
import { hydrateParticipant } from './players'

type MatchListRow = {
  match_id: string
  game_key: string
  status: string
  created_at: number
  seat_a_player_ref: string
  seat_b_player_ref: string
}

export type HydratedMatchListEntry = {
  matchId: string
  gameKey: string
  gameTitle: string
  status: 'active' | 'finished'
  createdAt: number
  participants: {
    A: Awaited<ReturnType<typeof hydrateParticipant>>
    B: Awaited<ReturnType<typeof hydrateParticipant>>
  }
}

const DoSnapshotResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    snapshot: MatchSnapshotSchema,
    controlProjection: z.unknown().optional(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string().min(1),
  }),
])

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function fetchMatchSnapshot(env: AppEnv, rawMatchId: string, locale: SupportedLocale): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const id = env.MATCH_ROOM.idFromName(matchId)
  const stub = env.MATCH_ROOM.get(id)
  const response = await stub.fetch(
    new Request('https://do/snapshot', {
      headers: { 'x-ks-match-id': matchId },
    }),
  )
  const payload = DoSnapshotResponseSchema.safeParse(await response.json())
  if (!payload.success) {
    return Response.json({ ok: false, error: 'Failed to parse snapshot response' }, { status: 502 })
  }

  if (!payload.data.ok) {
    const status = payload.data.error === 'Unknown match' ? 404 : response.status
    return Response.json({ ok: false, error: payload.data.error ?? 'Failed to load snapshot' }, { status })
  }
  const snapshot = payload.data.snapshot

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

  return Response.json({ ok: true, snapshot, participants, controlProjection: payload.data.controlProjection })
}

export async function getMatchControlSecret(env: AppEnv, rawMatchId: string): Promise<string | null> {
  const matchId = normalizeMatchId(rawMatchId)
  const row = await env.DB.prepare('SELECT control_secret FROM matches WHERE match_id = ?')
    .bind(matchId)
    .first<{ control_secret: string }>()
  return row?.control_secret ?? null
}

export async function listMatches(env: AppEnv, locale: SupportedLocale): Promise<HydratedMatchListEntry[]> {
  const res = await env.DB.prepare(
    [
      'SELECT match_id, game_key, status, created_at, seat_a_player_ref, seat_b_player_ref',
      'FROM matches',
      'ORDER BY created_at DESC',
    ].join(' '),
  )
    .bind()
    .all<MatchListRow>()

  return await Promise.all(
    (res.results ?? []).map(async (row) => ({
      matchId: row.match_id,
      gameKey: row.game_key,
      gameTitle: isRegisteredGameKey(row.game_key) ? registry[row.game_key].meta.title[locale] : row.game_key,
      status: row.status === 'finished' ? 'finished' : 'active',
      createdAt: row.created_at,
      participants: {
        A: await hydrateParticipant(env, row.seat_a_player_ref, locale),
        B: await hydrateParticipant(env, row.seat_b_player_ref, locale),
      },
    })),
  )
}

export async function listStoredEvents(env: AppEnv, rawMatchId: string): Promise<StoredEvent[]> {
  const matchId = normalizeMatchId(rawMatchId)
  const res = await env.DB.prepare(
    'SELECT seq, event_id, type, payload_json, client_id, client_seq, at, received_at FROM events WHERE match_id = ? ORDER BY seq ASC',
  )
    .bind(matchId)
    .all<{
      seq: number
      event_id: string
      type: string
      payload_json: string
      client_id: string
      client_seq: number
      at: number
      received_at: number
    }>()

  return (res.results ?? [])
    .map((row) => {
      const payload = tryParseJson(row.payload_json)
      if (payload === null) return null

      const parsed = StoredEventSchema.safeParse({
        seq: row.seq,
        eventId: row.event_id,
        matchId,
        clientId: row.client_id,
        clientSeq: row.client_seq,
        at: row.at,
        receivedAt: row.received_at,
        type: row.type,
        payload,
      })

      return parsed.success ? parsed.data : null
    })
    .flatMap((entry) => (entry ? [entry] : []))
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

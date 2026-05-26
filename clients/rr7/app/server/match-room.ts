import { normalizeMatchId } from '@ks/competition'
import {
  ControlCommandSectionsSchema,
  MatchSnapshotSchema,
  StoredEventSchema,
  type ControlCommand,
  type StoredEvent,
} from '@ks/core'
import { GameControlProjectionSchema, isRegisteredGameKey, registry } from '@ks/gameplay'
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
    controlProjection: GameControlProjectionSchema.optional(),
    controlSections: ControlCommandSectionsSchema.optional(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string().min(1),
    status: z.number().int().positive().optional(),
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
  const stub = env.MATCH_ROOM.getByName(matchId)
  const result = await stub.snapshot({ matchId })
  const payload = DoSnapshotResponseSchema.safeParse(result)
  if (!payload.success) {
    return Response.json({ ok: false, error: 'Failed to parse snapshot response' }, { status: 502 })
  }

  if (!payload.data.ok) {
    const status = payload.data.error === 'Unknown match' ? 404 : payload.data.status === 409 ? 409 : 502
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

  return Response.json({
    ok: true,
    snapshot,
    participants,
    controlProjection: payload.data.controlProjection,
    controlSections: payload.data.controlSections,
  })
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
      "ORDER BY CASE WHEN status = 'finished' THEN 1 ELSE 0 END ASC, created_at DESC",
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
  commands: ControlCommand[],
): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const stub = env.MATCH_ROOM.getByName(matchId)
  const result = await stub.events({ matchId, controlSecret, commands })
  return Response.json(result, { status: result.ok ? 200 : result.status })
}

export async function streamMatchEvents(env: AppEnv, rawMatchId: string, since?: string | null): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const stub = env.MATCH_ROOM.getByName(matchId)
  const parsedSince = since && since.length > 0 ? Number(since) : undefined
  return stub.stream({ matchId, ...(Number.isFinite(parsedSince) && parsedSince !== undefined ? { since: parsedSince } : {}) })
}

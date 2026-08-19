import { normalizeMatchId } from '@ks/competition'
import {
  ControlCommandSectionsSchema,
  MatchSnapshotSchema,
  NonEmptyStringSchema,
  PositiveIntegerSchema,
  StoredFactSchema,
  type ControlCommand,
  type StoredFact,
} from '@ks/core'
import { GameControlProjectionSchema, isRegisteredGameKey, registry } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import * as v from 'valibot'

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

const DoSnapshotResponseSchema = v.union([
  v.object({
    ok: v.literal(true),
    snapshot: MatchSnapshotSchema,
    controlProjection: v.optional(GameControlProjectionSchema),
    controlSections: v.optional(ControlCommandSectionsSchema),
  }),
  v.object({
    ok: v.literal(false),
    error: NonEmptyStringSchema,
    status: v.optional(PositiveIntegerSchema),
  }),
])

export async function fetchMatchSnapshot(env: AppEnv, rawMatchId: string, locale: SupportedLocale): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const stub = env.MATCH_ROOM.getByName(matchId)
  const result = await stub.snapshot({ matchId })
  const payload = v.safeParse(DoSnapshotResponseSchema, result)
  if (!payload.success) {
    return Response.json({ ok: false, error: 'Failed to parse snapshot response' }, { status: 502 })
  }

  if (!payload.output.ok) {
    const status = payload.output.error === 'Unknown match' ? 404 : payload.output.status === 409 ? 409 : 502
    return Response.json({ ok: false, error: payload.output.error ?? 'Failed to load snapshot' }, { status })
  }
  const snapshot = payload.output.snapshot

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
    controlProjection: payload.output.controlProjection,
    controlSections: payload.output.controlSections,
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

export async function listStoredFacts(env: AppEnv, rawMatchId: string): Promise<StoredFact[]> {
  const matchId = normalizeMatchId(rawMatchId)
  const res = await env.DB.prepare(
    'SELECT seq, fact_id, type, payload_json, client_id, client_seq, at, received_at FROM facts WHERE match_id = ? ORDER BY seq ASC',
  )
    .bind(matchId)
    .all<{
      seq: number
      fact_id: string
      type: string
      payload_json: string
      client_id: string
      client_seq: number
      at: number
      received_at: number
    }>()

  return (res.results ?? [])
    .map((row) => {
      const payload = v.safeParse(v.pipe(v.string(), v.parseJson()), row.payload_json)
      if (!payload.success) return null

      const parsed = v.safeParse(StoredFactSchema, {
        seq: row.seq,
        factId: row.fact_id,
        matchId,
        clientId: row.client_id,
        clientSeq: row.client_seq,
        at: row.at,
        receivedAt: row.received_at,
        type: row.type,
        payload: payload.output,
      })

      return parsed.success ? parsed.output : null
    })
    .flatMap((entry) => (entry ? [entry] : []))
}

export async function postMatchFacts(
  env: AppEnv,
  rawMatchId: string,
  controlSecret: string,
  commands: ControlCommand[],
): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const stub = env.MATCH_ROOM.getByName(matchId)
  const result = await stub.facts({ matchId, controlSecret, commands })
  return Response.json(result, { status: result.ok ? 200 : result.status })
}

export async function streamMatchFacts(env: AppEnv, rawMatchId: string, since?: string | null): Promise<Response> {
  const matchId = normalizeMatchId(rawMatchId)
  const stub = env.MATCH_ROOM.getByName(matchId)
  const parsedSince = since && since.length > 0 ? Number(since) : undefined
  return stub.stream({ matchId, since: Number.isFinite(parsedSince) ? parsedSince : undefined })
}

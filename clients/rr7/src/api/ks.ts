import { newClientId, newEventId, type ClientEvent, type MatchSnapshot } from '@ks/domain'

import { getJson, postJson } from './http'

function getOrCreateClientId(): string {
  const existing = localStorage.getItem('ks.clientId')
  if (existing) return existing
  const created = newClientId() as unknown as string
  localStorage.setItem('ks.clientId', created)
  return created
}

function nextClientSeq(matchId: string): number {
  const key = `ks.clientSeq.${matchId}`
  const cur = Number(localStorage.getItem(key) ?? '0')
  const next = cur + 1
  localStorage.setItem(key, String(next))
  return next
}

export async function createMatch(args: {
  adminUser: string
  adminPass: string
  gameId: 'free-pyramid' | 'combined-pyramid-old'
  targets: {
    frameTargetPointsBySeat: { A: number; B: number }
    matchTargetFramesBySeat: { A: number; B: number }
  }
  participants: { seat: 'A' | 'B'; displayName: string }[]
}): Promise<{ matchId: string; publicUrl: string; controlUrl: string }> {
  const auth = btoa(`${args.adminUser}:${args.adminPass}`)
  const res = await postJson<{
    ok: boolean
    matchId: string
    publicUrl: string
    controlUrl: string
  }>(
    '/api/admin/matches',
    {
      gameId: args.gameId,
      targets: args.targets,
      participants: args.participants,
    },
    { headers: { authorization: `Basic ${auth}` } },
  )
  return { matchId: res.matchId, publicUrl: res.publicUrl, controlUrl: res.controlUrl }
}

export async function getSnapshot(matchId: string): Promise<MatchSnapshot> {
  const res = await getJson<{ ok: boolean; snapshot: MatchSnapshot }>(`/api/matches/${matchId}`)
  return res.snapshot
}

export async function postEvents(matchId: string, controlSecret: string, events: ClientEvent[]): Promise<void> {
  await postJson(`/api/matches/${matchId}/events`, { controlSecret, events })
}

export function makeScoreDeltaEvent(matchId: string, seat: 'A' | 'B', delta: number): ClientEvent {
  const clientId = getOrCreateClientId()
  return {
    eventId: newEventId(),
    matchId: matchId as any,
    clientId: clientId as any,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'score.delta',
    payload: { seat, delta },
  } as ClientEvent
}

export function makeAwardFrameEvent(matchId: string, seat: 'A' | 'B', frameIndex: number): ClientEvent {
  const clientId = getOrCreateClientId()
  return {
    eventId: newEventId(),
    matchId: matchId as any,
    clientId: clientId as any,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'frame.awarded',
    payload: { frameIndex, winnerSeat: seat },
  } as ClientEvent
}

export function makeStartFrameEvent(matchId: string, frameIndex: number): ClientEvent {
  const clientId = getOrCreateClientId()
  return {
    eventId: newEventId(),
    matchId: matchId as any,
    clientId: clientId as any,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'frame.started',
    payload: { frameIndex },
  } as ClientEvent
}

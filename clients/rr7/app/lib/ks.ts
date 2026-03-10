import {
  ClientIdSchema,
  MatchIdSchema,
  newClientId,
  newEventId,
  type ClientEvent,
} from '@ks/domain'
import type { RegisteredGameKey } from '@ks/games'

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

export function makeShotRecordedEvent(matchId: string, gameKey: RegisteredGameKey, seat: 'A' | 'B', points: number): ClientEvent {
  const parsedMatchId = MatchIdSchema.parse(matchId)
  const parsedClientId = ClientIdSchema.parse(getOrCreateClientId())
  return {
    eventId: newEventId(),
    matchId: parsedMatchId,
    clientId: parsedClientId,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'game.command',
    payload: {
      gameKey,
      commandType: 'shot.recorded',
      command: { seat, points },
    },
  } as ClientEvent
}

export function makeAwardFrameEvent(matchId: string, seat: 'A' | 'B', frameIndex: number): ClientEvent {
  const parsedMatchId = MatchIdSchema.parse(matchId)
  const parsedClientId = ClientIdSchema.parse(getOrCreateClientId())
  return {
    eventId: newEventId(),
    matchId: parsedMatchId,
    clientId: parsedClientId,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'frame.awarded',
    payload: { frameIndex, winnerSeat: seat },
  } as ClientEvent
}

export function makeStartFrameEvent(matchId: string, frameIndex: number): ClientEvent {
  const parsedMatchId = MatchIdSchema.parse(matchId)
  const parsedClientId = ClientIdSchema.parse(getOrCreateClientId())
  return {
    eventId: newEventId(),
    matchId: parsedMatchId,
    clientId: parsedClientId,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'frame.started',
    payload: { frameIndex },
  } as ClientEvent
}

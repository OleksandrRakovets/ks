import {
  ClientIdSchema,
  FrameAwardedEventSchema,
  FrameStartedEventSchema,
  GameCommandEventSchema,
  MatchEndedEventSchema,
  MatchIdSchema,
  newClientId,
  newEventId,
  type ClientEvent,
} from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay'

function getOrCreateClientId(): string {
  const existing = localStorage.getItem('ks.clientId')
  if (existing) return existing
  const created = newClientId()
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

export function makeShotRecordedEvent(
  matchId: string,
  gameKey: RegisteredGameKey,
  seat: 'A' | 'B',
  points: number,
): ClientEvent {
  const parsedMatchId = MatchIdSchema.parse(matchId)
  const parsedClientId = ClientIdSchema.parse(getOrCreateClientId())
  return GameCommandEventSchema.parse({
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
  })
}

export function makeGameCommandEvent(
  matchId: string,
  gameKey: RegisteredGameKey,
  commandType: string,
  command: unknown,
): ClientEvent {
  const parsedMatchId = MatchIdSchema.parse(matchId)
  const parsedClientId = ClientIdSchema.parse(getOrCreateClientId())
  return GameCommandEventSchema.parse({
    eventId: newEventId(),
    matchId: parsedMatchId,
    clientId: parsedClientId,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'game.command',
    payload: {
      gameKey,
      commandType,
      command,
    },
  })
}

export function makeAwardFrameEvent(matchId: string, seat: 'A' | 'B', frameIndex: number): ClientEvent {
  const parsedMatchId = MatchIdSchema.parse(matchId)
  const parsedClientId = ClientIdSchema.parse(getOrCreateClientId())
  return FrameAwardedEventSchema.parse({
    eventId: newEventId(),
    matchId: parsedMatchId,
    clientId: parsedClientId,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'frame.awarded',
    payload: { frameIndex, winnerSeat: seat },
  })
}

export function makeStartFrameEvent(matchId: string, frameIndex: number): ClientEvent {
  const parsedMatchId = MatchIdSchema.parse(matchId)
  const parsedClientId = ClientIdSchema.parse(getOrCreateClientId())
  return FrameStartedEventSchema.parse({
    eventId: newEventId(),
    matchId: parsedMatchId,
    clientId: parsedClientId,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'frame.started',
    payload: { frameIndex },
  })
}

export function makeEndMatchEvent(matchId: string): ClientEvent {
  const parsedMatchId = MatchIdSchema.parse(matchId)
  const parsedClientId = ClientIdSchema.parse(getOrCreateClientId())
  return MatchEndedEventSchema.parse({
    eventId: newEventId(),
    matchId: parsedMatchId,
    clientId: parsedClientId,
    clientSeq: nextClientSeq(matchId),
    at: Date.now(),
    type: 'match.ended',
    payload: { reason: 'target-reached' },
  })
}

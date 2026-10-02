import type { MatchStateFor } from '@ks/competition/definitions'
import type { MatchId } from '@ks/core'
import type { GameKey, GamePresentationFor } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Effect } from 'effect'

import { ApplicationClock } from '../match/clock'
import { presentLastCommand } from '../match/last-command-projection'
import type { MatchRoomClient } from '../match/match-room'
import { MatchRooms } from '../match/match-room'
import { renderProtocolRows } from '../match/protocol-projection'
import { presentParticipant } from '../player/participant'
import { PlayerStorage } from '../player/storage/player-storage'
import type { ReadMatchFailure, ReadMatchProtocolResult, ReadMatchResult } from './contract'
import { presentFinishedMatch, projectMatchFacts } from './projections'
import type { MatchRecord } from './storage/records'
import { SparringMatchStorage } from './storage/sparring-match-storage'

export const readMatch = Effect.fn('readMatch')(function* <K extends GameKey>(
  matchId: MatchId,
  locale: SupportedLocale,
  expectedGameKey: K,
): Effect.fn.Return<
  ReadMatchResult<K>,
  EffectDrizzleQueryError,
  ApplicationClock | MatchRooms | PlayerStorage | SparringMatchStorage
> {
  const matches = yield* SparringMatchStorage
  const clock = yield* ApplicationClock

  const result = yield* lookupMatch(
    matchId,
    expectedGameKey,
    (room) => room.getControls(),
    Effect.fnUntraced(function* (record) {
      const archive = yield* matches.findFinishedArchive(record.matchId)

      return archive === null
        ? null
        : {
            _tag: 'ended',
            source: 'archive',
            state: archive.state,
            gameResult: archive.gameResult,
            latestSeq: archive.sourceLatestSeq,
            endedAt: record.endedAt,
          }
    }),
  )

  if (!result.ok) return result
  const { record, match } = result
  const participants = yield* hydrateParticipants(record, locale)

  if (match._tag === 'ended') {
    return presentFinishedMatch(
      match,
      participants,
      clock.instantPresentation(match.endedAt),
      clock.nowPresentation(),
    )
  }

  const seatNames = { A: participants.A.displayName, B: participants.B.displayName }

  const base = {
    ...projectMatchFacts(match.state, match.latestSeq, participants),
    lifecycle: 'active' as const,
    winnerSeat: null,
    controls: match.controls,
  }

  const active =
    match.game === undefined
      ? { ...base, controlPhase: 'between-frames' as const }
      : { ...base, controlPhase: 'frame-active' as const, game: match.game }

  const lastCommand = match.lastCommand ? presentLastCommand(match.lastCommand, seatNames) : undefined

  return lastCommand === undefined ? active : { ...active, lastCommand }
})

export const readMatchProtocol = Effect.fn('readMatchProtocol')(function* <K extends GameKey>(
  matchId: MatchId,
  locale: SupportedLocale,
  expectedGameKey: K,
): Effect.fn.Return<
  ReadMatchProtocolResult<K>,
  EffectDrizzleQueryError,
  ApplicationClock | MatchRooms | PlayerStorage | SparringMatchStorage
> {
  const matches = yield* SparringMatchStorage
  const clock = yield* ApplicationClock

  const result = yield* lookupMatch(
    matchId,
    expectedGameKey,
    (room) => room.getProtocol(),
    Effect.fnUntraced(function* (record) {
      const archive = yield* matches.findProtocolArchive(record.matchId)

      return archive === null
        ? null
        : {
            _tag: 'ended',
            source: 'archive',
            state: archive.state,
            gameResult: archive.gameResult,
            latestSeq: archive.sourceLatestSeq,
            endedAt: record.endedAt,
            protocolEntries: archive.entries,
          }
    }),
  )

  if (!result.ok) return result
  const { record, match } = result
  const participants = yield* hydrateParticipants(record, locale)
  const seatNames = { A: participants.A.displayName, B: participants.B.displayName }
  const protocolRows = renderProtocolRows(match.protocolEntries, seatNames, clock)

  if (match._tag === 'ended') {
    return {
      ...projectMatchFacts(match.state, match.latestSeq, participants),
      lifecycle: 'finished',
      winnerSeat: match.state.winnerSeat,
      protocolRows,
    }
  }

  const base = {
    ...projectMatchFacts(match.state, match.latestSeq, participants),
    lifecycle: 'active' as const,
    winnerSeat: null,
    protocolRows: protocolRows.reverse(),
  }

  return match.game === undefined
    ? { ...base, controlPhase: 'between-frames' }
    : { ...base, controlPhase: 'frame-active', game: match.game }
})

type RoomRead = Awaited<ReturnType<MatchRoomClient['getControls'] | MatchRoomClient['getProtocol']>>

type EndedMatch<Room extends RoomRead> = Omit<Extract<Room, { _tag: 'finalizing' }>, '_tag'> & {
  _tag: 'ended'
  source: 'archive' | 'room'
}

type MatchRead<Room extends RoomRead> = Extract<Room, { _tag: 'active' }> | EndedMatch<Room>

const lookupMatch = Effect.fnUntraced(function* <K extends GameKey, Room extends RoomRead>(
  matchId: MatchId,
  expectedGameKey: K,
  readRoom: (room: EffectMatchRoomClient) => Effect.Effect<Room>,
  readArchive: (
    record: Extract<MatchRecord, { status: 'finished' }>,
  ) => Effect.Effect<EndedMatch<Room> | null, EffectDrizzleQueryError>,
): Effect.fn.Return<
  | ReadMatchFailure
  | {
      ok: true
      record: MatchRecord
      match: MatchRead<Room> & { state: MatchStateFor<K>; game?: GamePresentationFor<K> | undefined }
    },
  EffectDrizzleQueryError,
  MatchRooms | SparringMatchStorage
> {
  const matches = yield* SparringMatchStorage
  const rooms = yield* MatchRooms
  const record = yield* matches.findMatch(matchId)

  if (!record || record.gameKey !== expectedGameKey) return { ok: false, reason: 'unknown-match' }

  if (record.status === 'creating') return { ok: false, reason: 'unknown-match' }
  let match: MatchRead<RoomRead>

  if (record.status === 'finished') {
    const archived = yield* readArchive(record)

    if (!archived) throw new Error('Missing finished match archive')

    if (archived.state.matchId !== matchId || archived.state.gameKey !== expectedGameKey)
      throw new Error('Finished match archive identity conflicts with D1')

    match = archived
  } else {
    const room = yield* readRoom(rooms.get(matchId))

    if (room.state.matchId !== matchId || room.state.gameKey !== expectedGameKey)
      throw new Error(`MatchRoom ${room._tag} identity conflicts with D1`)

    match = room._tag === 'finalizing' ? { ...room, _tag: 'ended', source: 'room' } : room
  }

  // SAFETY: each source provides coherent state/game projections; the owning state's key is checked above.
  return {
    ok: true,
    record,
    match: match as MatchRead<Room> & { state: MatchStateFor<K>; game?: GamePresentationFor<K> | undefined },
  }
})

const hydrateParticipants = Effect.fnUntraced(function* (record: MatchRecord, locale: SupportedLocale) {
  const players = yield* PlayerStorage

  return {
    A: presentParticipant(yield* players.readParticipant(record.participantRefs.A), locale),
    B: presentParticipant(yield* players.readParticipant(record.participantRefs.B), locale),
  }
})

type EffectMatchRoomClient = ReturnType<MatchRooms['Service']['get']>

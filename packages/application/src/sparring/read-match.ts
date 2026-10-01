import type { MatchStateFor } from '@ks/competition/definitions'
import type { MatchId } from '@ks/core'
import type { GameKey, GamePresentationFor } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import { presentLastCommand } from '../match/last-command-projection'
import type { MatchRoomClient } from '../match/match-room'
import { renderProtocolRows } from '../match/protocol-projection'
import { presentParticipant } from '../player/participant'
import type { ReadMatchFailure, ReadMatchProtocolResult, ReadMatchResult } from './contract'
import { presentFinishedMatch } from './projections'
import type { SparringDependencies } from './sparring-application'
import type { MatchRecord } from './storage/records'

export async function readMatch<K extends GameKey>(
  deps: SparringDependencies,
  matchId: MatchId,
  locale: SupportedLocale,
  expectedGameKey: K,
): Promise<ReadMatchResult<K>> {
  const result = await lookupMatch(
    deps,
    matchId,
    expectedGameKey,
    (room) => room.getControls(),
    async (record) => {
      const archive = await deps.matches.findFinishedArchive(record.matchId)

      return archive === null
        ? null
        : {
            _tag: 'finalizing',
            state: archive.state,
            gameResult: archive.gameResult,
            latestSeq: archive.sourceLatestSeq,
            endedAt: record.endedAt,
          }
    },
  )

  if (!result.ok) return result
  const { record, match } = result
  const participants = await hydrateParticipants(deps, record, locale)

  if (match._tag === 'finalizing') {
    return presentFinishedMatch(
      match,
      participants,
      deps.clock.instantPresentation(match.endedAt),
      deps.clock.nowPresentation(),
    )
  }

  const seatNames = { A: participants.A.displayName, B: participants.B.displayName }

  const base = {
    ok: true as const,
    lifecycle: 'active' as const,
    state: match.state,
    latestSeq: match.latestSeq,
    participants,
    controls: match.controls,
  }

  const active =
    match.game === undefined
      ? { ...base, controlPhase: 'between-frames' as const }
      : { ...base, controlPhase: 'frame-active' as const, game: match.game }

  const lastCommand = match.lastCommand ? presentLastCommand(match.lastCommand, seatNames) : undefined

  return lastCommand === undefined ? active : { ...active, lastCommand }
}

export async function readMatchProtocol<K extends GameKey>(
  deps: SparringDependencies,
  matchId: MatchId,
  locale: SupportedLocale,
  expectedGameKey: K,
): Promise<ReadMatchProtocolResult<K>> {
  const result = await lookupMatch(
    deps,
    matchId,
    expectedGameKey,
    (room) => room.getProtocol(),
    async (record) => {
      const archive = await deps.matches.findProtocolArchive(record.matchId)

      return archive === null
        ? null
        : {
            _tag: 'finalizing',
            state: archive.state,
            gameResult: archive.gameResult,
            latestSeq: archive.sourceLatestSeq,
            endedAt: record.endedAt,
            protocolEntries: archive.entries,
          }
    },
  )

  if (!result.ok) return result
  const { record, match } = result
  const participants = await hydrateParticipants(deps, record, locale)
  const seatNames = { A: participants.A.displayName, B: participants.B.displayName }
  const protocolRows = renderProtocolRows(match.protocolEntries, seatNames, deps.clock)

  if (match._tag === 'finalizing') {
    return {
      ...presentFinishedMatch(
        match,
        participants,
        deps.clock.instantPresentation(match.endedAt),
        deps.clock.nowPresentation(),
      ),
      protocolRows,
    }
  }

  const base = {
    ok: true as const,
    lifecycle: 'active' as const,
    state: match.state,
    latestSeq: match.latestSeq,
    participants,
    protocolRows: protocolRows.reverse(),
  }

  return match.game === undefined
    ? { ...base, controlPhase: 'between-frames' }
    : { ...base, controlPhase: 'frame-active', game: match.game }
}

type RoomRead = Awaited<ReturnType<MatchRoomClient['getControls'] | MatchRoomClient['getProtocol']>>

async function lookupMatch<K extends GameKey, Room extends RoomRead>(
  deps: SparringDependencies,
  matchId: MatchId,
  expectedGameKey: K,
  readRoom: (room: MatchRoomClient) => Promise<Room>,
  readArchive: (
    record: Extract<MatchRecord, { status: 'finished' }>,
  ) => Promise<Extract<Room, { _tag: 'finalizing' }> | null>,
): Promise<
  | ReadMatchFailure
  | {
      ok: true
      record: MatchRecord
      match: Room & { state: MatchStateFor<K>; game?: GamePresentationFor<K> }
    }
> {
  const record = await deps.matches.findMatch(matchId)

  if (!record || record.gameKey !== expectedGameKey) return { ok: false, reason: 'unknown-match' }

  if (record.status === 'creating') return { ok: false, reason: 'unknown-match' }
  let match: Room

  if (record.status === 'finished') {
    const archived = await readArchive(record)

    if (!archived) throw new Error('Missing finished match archive')

    if (archived.state.matchId !== matchId || archived.state.gameKey !== expectedGameKey)
      throw new Error('Finished match archive identity conflicts with D1')

    match = archived
  } else {
    match = await readRoom(deps.matchRoomClient(matchId))

    if (match.state.matchId !== matchId || match.state.gameKey !== expectedGameKey)
      throw new Error(`MatchRoom ${match._tag} identity conflicts with D1`)
  }

  // SAFETY: each source provides coherent state/game projections; the owning state's key is checked above.
  return {
    ok: true,
    record,
    match: match as Room & { state: MatchStateFor<K>; game?: GamePresentationFor<K> },
  }
}

async function hydrateParticipants(deps: SparringDependencies, record: MatchRecord, locale: SupportedLocale) {
  return {
    A: presentParticipant(await deps.players.readParticipant(record.participantRefs.A), locale),
    B: presentParticipant(await deps.players.readParticipant(record.participantRefs.B), locale),
  }
}

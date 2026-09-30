import {
  correctionReferenceOf,
  type MatchState,
  type ProtocolEntries,
  type ProtocolEntry,
} from '@ks/competition'
import { type BySeatNumber, type Clock, type MatchId, type Seat } from '@ks/core'
import type { GameResult, StrilaBall } from '@ks/gameplay/definitions'

export const PROTOCOL_ARCHIVE_VERSION = 1 as const

export class UnsupportedProtocolArchiveVersionError extends Error {
  constructor(matchId: MatchId, version: number) {
    super(`Unsupported protocol archive version ${String(version)} for match ${matchId}`)
    this.name = 'UnsupportedProtocolArchiveVersionError'
  }
}

export class ProtocolArchiveCorruptionError extends Error {
  constructor(matchId: MatchId) {
    super(`Protocol archive storage corruption for match ${matchId}`)
    this.name = 'ProtocolArchiveCorruptionError'
  }
}

type ArchiveStateRecord = Readonly<{
  sourceLatestSeq: number
  state: MatchState
  gameResult: GameResult | null
}>

export type FinishedMatchArchiveRecord = ArchiveStateRecord & Readonly<{ entries?: never }>

export type ProtocolArchiveRecord = ArchiveStateRecord &
  Readonly<{ protocolVersion: typeof PROTOCOL_ARCHIVE_VERSION; entries: ProtocolEntries }>

type SeatNames = Readonly<{ A: string; B: string }>

export type ProtocolRow = Readonly<{
  key: string
  message: ProtocolMessage
  score?: BySeatNumber | undefined
  acceptedAtIso: string
  acceptedAtLabel: string
}>

export type ProtocolMessage = Readonly<{
  key: string
  actor?: string | undefined
  params?: Readonly<Record<string, string | number>>
  pottedBalls?: readonly StrilaBall[]
  correctedEntry?: ProtocolMessage
}>

export function protocolEntryMessage(entry: ProtocolEntry, seatNames: SeatNames): ProtocolRow['message'] {
  const seatLabel = (seat: Seat) => seatNames[seat]
  const actor = seatLabel(entry.seat)

  if (entry.entryType === 'player-command') {
    const body = entry.body

    switch (body.commandType) {
      case 'frame.commence':
        return { key: 'match.protocol.commands.frame.commence', actor }
      case 'respotted-black.opening.select':
        return { key: 'match.protocol.commands.respotted-black.opening.select', actor }
      case 'pot.record':
        if ('pottedBalls' in body) {
          return { key: 'match.protocol.commands.pot.record.balls', actor, pottedBalls: body.pottedBalls }
        }

        return {
          key: 'match.protocol.commands.pot.record.pottedBallCount',
          actor,
          params: { pottedBallCount: `+${body.pottedBallCount}` },
        }
      case 'miss.record':
        return { key: 'match.protocol.commands.miss.record', actor }
      case 'foul.commit':
        return {
          key: `match.protocol.commands.foul.commit.${'penalty' in body ? body.penalty : 'default'}`,
          actor,
        }
      case 'penalty.select':
        return { key: `match.protocol.commands.penalty.select.${body.choice}`, actor }
      case 'frame.award':
        return { key: 'match.protocol.commands.frame.award', actor }
    }
  }

  if (entry.entryType === 'system-note') {
    const body = entry.body

    switch (body.systemType) {
      case 'automatic-foul':
        return { key: `match.protocol.system.automatic-foul.${body.reason}` }
      case 'winner-determined':
        return { key: `match.protocol.system.winner-determined.${body.reason}` }
      case 'respotted-black-declared':
        return { key: 'match.protocol.system.respotted-black-declared' }
    }
  }

  switch (entry.entryType) {
    case 'frame-prepared':
      return {
        key: 'match.protocol.system.frame-prepared.breaker',
        actor: seatLabel(entry.seat),
        params: { frameIndex: String(entry.frameIndex) },
      }
    case 'frame-awarded':
      return { key: 'match.protocol.system.frame-completed', actor }
    case 'frame-conceded':
      return { key: 'match.protocol.system.frame-conceded', actor }
    case 'match-ended':
      return { key: 'match.protocol.system.match-ended', actor }
    case 'command-corrected':
      break
  }

  return { key: 'match.protocol.unknown', params: { value: entry.entryType } }
}

export function renderProtocolRows(
  entries: readonly ProtocolEntry[],
  seatNames: SeatNames,
  clock: Clock,
): ProtocolRow[] {
  return entries.map((entry) => {
    const { isoString: acceptedAtIso, time: acceptedAtLabel } = clock.instantPresentation(entry.acceptedAt)

    return {
      key: `protocol-${entry.acceptedSeq}-${entry.entryIndex}`,
      message: correctionMessage(entry, entries, seatNames) ?? protocolEntryMessage(entry, seatNames),
      score: entry.scoreAfter,
      acceptedAtIso,
      acceptedAtLabel,
    }
  })
}

function correctionMessage(
  entry: ProtocolEntry,
  entries: readonly ProtocolEntry[],
  seatNames: SeatNames,
): ProtocolMessage | undefined {
  const reference = correctionReferenceOf(entry)

  if (!reference) return undefined

  let original: ProtocolEntry | undefined

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const candidate = entries[index]

    if (
      candidate &&
      candidate.acceptedSeq === reference.targetSeq &&
      candidate.causedByCommandId === reference.targetCommandId &&
      candidate.entryIndex === reference.targetEntryIndex
    ) {
      original = candidate
      break
    }
  }

  if (!original) return undefined

  return {
    key: 'match.protocol.commandCorrected',
    actor: original.source === 'player' ? seatNames[original.seat] : undefined,
    correctedEntry: protocolEntryMessage(original, seatNames),
  }
}

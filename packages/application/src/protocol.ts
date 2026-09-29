import { correctionReferenceOf, isCorrectableProtocolEntry } from '@ks/competition'
import {
  type BySeatNumber,
  type Clock,
  CommandId,
  type MatchId,
  type MatchState,
  type ProtocolEntries,
  ProtocolEntry,
  type Seat,
} from '@ks/core'
import type { GameResult } from '@ks/gameplay/definitions'
import * as v from 'valibot'

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

type ProtocolMessage = Readonly<{
  key: string
  actor?: string | undefined
  params?: Readonly<Record<string, string | number>>
  pottedBalls?: readonly ProtocolBall[]
  correctedEntry?: ProtocolMessage
}>

export type LastCommandRow = Pick<ProtocolRow, 'key' | 'message' | 'score'> &
  Readonly<{
    target?: { acceptedSeq: number; commandId: CommandId }
  }>

const ProtocolBall = v.picklist([0, 1, 2, 3, 4, 5, 6, 7])

type ProtocolBall = v.InferOutput<typeof ProtocolBall>

const PottedBalls = v.pipe(v.array(ProtocolBall), v.minLength(1))

const ProtocolMessageBody = v.object({
  commandType: v.optional(v.string()),
  systemType: v.optional(v.string()),
  pottedBalls: v.optional(v.unknown()),
  pottedBallCount: v.optional(v.number()),
  penalty: v.optional(v.string()),
  choice: v.optional(v.string()),
  frameIndex: v.optional(v.unknown()),
  reason: v.optional(v.string()),
})

function entryMessage(
  entry: Pick<ProtocolEntry, 'body' | 'entryType' | 'seat' | 'frameIndex'>,
  seatNames: SeatNames,
): ProtocolRow['message'] {
  const seatLabel = (seat: Seat) => seatNames[seat]
  const actor = seatLabel(entry.seat)
  const parsedBody = v.safeParse(ProtocolMessageBody, entry.body)
  const body = parsedBody.success ? parsedBody.output : {}
  const commandType = body.commandType ?? null

  switch (commandType) {
    case null:
      break
    case 'frame.commence':
      return { key: 'match.protocol.commands.frame.commence', actor }
    case 'respotted-black.opening.select':
      return { key: 'match.protocol.commands.respotted-black.opening.select', actor }
    case 'pot.record': {
      const pottedBalls = v.safeParse(PottedBalls, body.pottedBalls)

      if (pottedBalls.success) {
        return { key: 'match.protocol.commands.pot.record.balls', actor, pottedBalls: pottedBalls.output }
      }

      const pottedBallCount = body.pottedBallCount

      if (pottedBallCount !== undefined) {
        return {
          key: 'match.protocol.commands.pot.record.pottedBallCount',
          actor,
          params: { pottedBallCount: `+${pottedBallCount}` },
        }
      }

      return { key: 'match.protocol.commands.pot.record.default', actor }
    }

    case 'miss.record':
      return { key: 'match.protocol.commands.miss.record', actor }
    case 'foul.commit':
      if (body.penalty === 'opponent-plus-one') {
        return { key: 'match.protocol.commands.foul.commit.opponent-plus-one', actor }
      }

      if (body.penalty === 'offender-minus-one') {
        return { key: 'match.protocol.commands.foul.commit.offender-minus-one', actor }
      }

      return { key: 'match.protocol.commands.foul.commit.default', actor }
    case 'penalty.select':
      switch (body.choice) {
        case undefined:
          return { key: 'match.protocol.commands.penalty.select.default', actor }
        case 'play-from-position':
          return { key: 'match.protocol.commands.penalty.select.play-from-position', actor }
        case 'pass-position':
          return { key: 'match.protocol.commands.penalty.select.pass-position', actor }
        case 'ball-in-hand':
          return { key: 'match.protocol.commands.penalty.select.ball-in-hand', actor }
        default:
          return { key: 'match.protocol.commands.penalty.select.default', actor }
      }

    case 'frame.award':
      return { key: 'match.protocol.commands.frame.award', actor }
  }

  const systemType = body.systemType ?? entry.entryType

  switch (systemType) {
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
    case 'automatic-foul':
      switch (body.reason) {
        case undefined:
          return { key: 'match.protocol.system.automatic-foul.default' }
        case 'third-consecutive-cue-ball-pot':
          return { key: 'match.protocol.system.automatic-foul.third-consecutive-cue-ball-pot' }
        case 'illegal-ball-in-hand-pot':
          return { key: 'match.protocol.system.automatic-foul.illegal-ball-in-hand-pot' }
        case 'respotted-black-opening-illegal-pot':
          return { key: 'match.protocol.system.automatic-foul.respotted-black-opening-illegal-pot' }
        default:
          return { key: 'match.protocol.system.automatic-foul.default' }
      }

    case 'winner-determined':
      switch (body.reason) {
        case undefined:
          return { key: 'match.protocol.system.winner-determined.default' }
        case 'target-reached':
          return { key: 'match.protocol.system.winner-determined.target-reached' }
        case 'table-cleared':
          return { key: 'match.protocol.system.winner-determined.table-cleared' }
        case 'automatic-foul':
          return { key: 'match.protocol.system.winner-determined.automatic-foul' }
        case 'respotted-black-won':
          return { key: 'match.protocol.system.winner-determined.respotted-black-won' }
        case 'foul-forfeit':
          return { key: 'match.protocol.system.winner-determined.foul-forfeit' }
        case 'black-ball':
          return { key: 'match.protocol.system.winner-determined.black-ball' }
        default:
          return { key: 'match.protocol.system.winner-determined.default' }
      }

    case 'respotted-black-declared':
      return { key: 'match.protocol.system.respotted-black-declared' }
  }

  return { key: 'match.protocol.unknown', params: { value: commandType ?? systemType } }
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
      message: correctionMessage(entry, entries, seatNames) ?? entryMessage(entry, seatNames),
      score: entry.scoreAfter,
      acceptedAtIso,
      acceptedAtLabel,
    }
  })
}

export function renderLastCommandRow(entry: ProtocolEntry, seatNames: SeatNames): LastCommandRow {
  const row: LastCommandRow = {
    key: `protocol-${entry.acceptedSeq}-${entry.entryIndex}`,
    message: entryMessage(entry, seatNames),
    score: entry.scoreAfter,
  }

  if (isCorrectableProtocolEntry(entry))
    return {
      ...row,
      target: { acceptedSeq: entry.acceptedSeq, commandId: entry.causedByCommandId },
    }

  return row
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
    correctedEntry: entryMessage(original, seatNames),
  }
}

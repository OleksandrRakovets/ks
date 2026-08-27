import {
  type BySeatNumber,
  BySeatNumberSchema,
  type MatchId,
  type MatchState,
  PositiveIntegerSchema,
  ProtocolEntrySourceSchema,
  type Seat,
  SeatSchema,
  type StoredProtocolEntry,
  type UnixEpochMilliseconds,
  UnixEpochMillisecondsSchema,
  UnknownObjectSchema,
} from '@ks/core'
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

const ArchiveBodySchema = UnknownObjectSchema

const ProtocolArchiveRowSchema = v.object({
  rowNo: PositiveIntegerSchema,
  acceptedAt: UnixEpochMillisecondsSchema,
  frameIndex: v.optional(PositiveIntegerSchema),
  source: ProtocolEntrySourceSchema,
  entryType: v.pipe(v.string(), v.minLength(1)),
  seat: SeatSchema,
  scoreAfter: v.optional(BySeatNumberSchema),
  body: ArchiveBodySchema,
})
export type ProtocolArchiveRow = v.InferOutput<typeof ProtocolArchiveRowSchema>

export const ProtocolArchiveRowsSchema = v.array(ProtocolArchiveRowSchema)

export type ProtocolArchiveRecord = {
  sourceLatestSeq: number
  protocolVersion: typeof PROTOCOL_ARCHIVE_VERSION
  rows: ProtocolArchiveRow[]
  state: MatchState
}

export const ProtocolArchiveSchema = v.object({
  protocolVersion: v.literal(PROTOCOL_ARCHIVE_VERSION),
  rows: ProtocolArchiveRowsSchema,
})

type SeatNames = { A: string; B: string }

export type ProtocolRow = {
  key: string
  message: {
    key: string
    actor?: string | undefined
    params?: Record<string, string | number>
    pottedBalls?: ProtocolBall[]
  }
  score?: BySeatNumber | undefined
  acceptedAt: UnixEpochMilliseconds
  timeLabel: string
}

type ProtocolArchiveRowDraft = Omit<ProtocolArchiveRow, 'rowNo'>
const ProtocolBallSchema = v.picklist([0, 1, 2, 3, 4, 5, 6, 7])
type ProtocolBall = v.InferOutput<typeof ProtocolBallSchema>
const PottedBallsSchema = v.pipe(v.array(ProtocolBallSchema), v.minLength(1))
const ProtocolMessageBodySchema = v.object({
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
  entry: Pick<ProtocolArchiveRow, 'body' | 'entryType' | 'seat'>,
  seatNames: SeatNames,
): ProtocolRow['message'] {
  const seatLabel = (seat: Seat) => seatNames[seat]
  const actor = seatLabel(entry.seat)
  const parsedBody = v.safeParse(ProtocolMessageBodySchema, entry.body)
  const body = parsedBody.success ? parsedBody.output : {}
  const commandType = body.commandType ?? null

  switch (commandType) {
    case 'frame.commence':
      return { key: 'match.protocol.commands.frame.commence', actor }
    case 'pot.record': {
      const pottedBalls = v.safeParse(PottedBallsSchema, body.pottedBalls)
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
        params: { frameIndex: String(body.frameIndex) },
      }
    case 'frame-completed':
      return { key: 'match.protocol.system.frame-completed', actor }
    case 'frame-conceded':
      return { key: 'match.protocol.system.frame-conceded', actor }
    case 'match-ended':
      return { key: 'match.protocol.system.match-ended', actor }
    case 'automatic-foul':
      switch (body.reason) {
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
        case 'target-reached':
          return { key: 'match.protocol.system.winner-determined.target-reached' }
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

  return { key: 'match.protocol.unknown', params: { value: commandType ?? systemType ?? entry.entryType } }
}

function rowFromProtocolEntry(entry: StoredProtocolEntry): ProtocolArchiveRowDraft {
  return {
    acceptedAt: entry.acceptedAt,
    frameIndex: entry.frameIndex,
    source: entry.source,
    entryType: entry.entryType,
    seat: entry.seat,
    scoreAfter: entry.scoreAfter,
    body: v.parse(ArchiveBodySchema, JSON.parse(entry.bodyJson)),
  }
}

export function prepareProtocolRowsForArchive(entries: StoredProtocolEntry[]): ProtocolArchiveRow[] {
  return [...entries]
    .sort((a, b) => a.acceptedSeq - b.acceptedSeq || a.entryIndex - b.entryIndex)
    .map((entry, index) => ({ ...rowFromProtocolEntry(entry), rowNo: index + 1 }))
}

export function renderProtocolRows(
  rows: ProtocolArchiveRow[],
  seatNames: SeatNames,
  timeZone: string,
  locale = 'en',
): ProtocolRow[] {
  return rows.map((row) => {
    return {
      key: `protocol-${row.rowNo}`,
      message: entryMessage(row, seatNames),
      score: row.scoreAfter,
      acceptedAt: row.acceptedAt,
      timeLabel: new Date(row.acceptedAt).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone,
      }),
    }
  })
}

export function deriveProtocolRows(
  entries: StoredProtocolEntry[],
  seatNames: SeatNames,
  timeZone: string,
  locale = 'en',
): ProtocolRow[] {
  return renderProtocolRows(prepareProtocolRowsForArchive(entries), seatNames, timeZone, locale)
}

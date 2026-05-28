import { opponentOf, type BySeatNumber, type ProtocolEntry, type Seat, type StoredEvent } from '@ks/core'
import { z } from 'zod'

export const PROTOCOL_ARCHIVE_VERSION = 1

const ArchiveBodySchema = z.record(z.string(), z.unknown())

export const ProtocolArchiveRowSchema = z.object({
  rowNo: z.number().int().positive(),
  receivedAt: z.number().int().nonnegative(),
  frameIndex: z.number().int().positive().optional(),
  source: z.enum(['player', 'system']),
  entryType: z.enum(['player-command', 'system-note', 'correction']),
  seat: z.enum(['A', 'B']).optional(),
  scoreAfter: z.object({ A: z.number(), B: z.number() }).optional(),
  body: ArchiveBodySchema,
})
export type ProtocolArchiveRow = z.infer<typeof ProtocolArchiveRowSchema>

export const ProtocolArchiveRowsSchema = z.array(ProtocolArchiveRowSchema)

export const ProtocolArchiveSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_ARCHIVE_VERSION),
  rows: ProtocolArchiveRowsSchema,
})
export type ProtocolArchive = z.infer<typeof ProtocolArchiveSchema>

type SeatNames = { A: string; B: string }
type StoredGameCommandEvent = Extract<StoredEvent, { type: 'game.command' }>

export type ProtocolRow = {
  key: string
  label: string
  score?: BySeatNumber
  receivedAt: number
  timeLabel: string
}

type ProtocolArchiveRowDraft = Omit<ProtocolArchiveRow, 'rowNo'>

function ballLabel(ball: number): string {
  if (ball === 0) return 'cue'
  if (ball === 1) return 'red'
  if (ball === 2) return 'yellow'
  if (ball === 3) return 'green'
  if (ball === 4) return 'brown'
  if (ball === 5) return 'blue'
  if (ball === 6) return 'pink'
  if (ball === 7) return 'black'
  return String(ball)
}

function entryLabel(entry: Pick<ProtocolArchiveRow, 'body' | 'entryType' | 'seat'>, seatNames: SeatNames): string {
  const seatLabel = (seat: Seat) => seatNames[seat]
  const actor = entry.seat ? `${seatLabel(entry.seat)}: ` : ''
  const commandType = typeof entry.body.commandType === 'string' ? entry.body.commandType : null

  switch (commandType) {
    case 'frame.commence':
      return `${actor}frame commenced`
    case 'pot.record': {
      const pottedBalls = entry.body.pottedBalls
      if (Array.isArray(pottedBalls)) {
        const summary = pottedBalls
          .filter((ball): ball is number => typeof ball === 'number')
          .map(ballLabel)
          .join(', ')
        return `${actor}pot (${summary.length > 0 ? summary : 'none'})`
      }

      const points = entry.body.points
      if (typeof points === 'number') {
        const signed = points >= 0 ? `+${points}` : String(points)
        return `${actor}pot ${signed}`
      }
      return `${actor}pot`
    }
    case 'miss.record':
      return `${actor}miss`
    case 'foul.commit':
      if (entry.body.penalty === 'opponent-plus-one') return `${actor}foul (opponent +1)`
      if (entry.body.penalty === 'offender-minus-one') return `${actor}foul (offender -1)`
      return `${actor}foul`
    case 'penalty.select':
      if (entry.body.choice === 'play-from-position') return `${actor}play from position`
      if (entry.body.choice === 'pass-position') return `${actor}pass position`
      if (entry.body.choice === 'ball-in-hand') return `${actor}ball in hand`
      return `${actor}penalty selected`
    case 'frame.award':
      return `${actor}frame awarded`
  }

  const systemType = typeof entry.body.systemType === 'string' ? entry.body.systemType : null
  switch (systemType) {
    case 'frame-started':
      return `Frame ${entry.body.frameIndex} started`
    case 'frame-completed':
      return `${actor}frame completed`
    case 'frame-conceded':
      return `${actor}frame conceded`
    case 'match-ended':
      return `${actor}match ended`
    case 'automatic-foul':
      if (entry.body.reason === 'third-consecutive-cue-ball-pot') return 'System: automatic foul (third cue-ball pot)'
      if (entry.body.reason === 'illegal-ball-in-hand-pot') return 'System: automatic foul (illegal ball-in-hand pot)'
      if (entry.body.reason === 'respotted-black-opening-illegal-pot') {
        return 'System: automatic foul (illegal respotted-black opening pot)'
      }
      return 'System: automatic foul'
    case 'winner-determined':
      if (entry.body.reason === 'target-reached') return 'System: winner determined (target reached)'
      if (entry.body.reason === 'foul-forfeit') return 'System: winner determined (foul forfeit)'
      if (entry.body.reason === 'black-ball') return 'System: winner determined (black ball)'
      return 'System: winner determined'
    case 'respotted-black-declared':
      return 'System: respotted black'
  }

  return commandType ?? systemType ?? entry.entryType
}

function rowFromProtocolEntry(event: StoredGameCommandEvent, entry: ProtocolEntry): ProtocolArchiveRowDraft {
  return {
    receivedAt: event.receivedAt,
    frameIndex: event.payload.frameIndex,
    source: entry.source,
    entryType: entry.entryType,
    ...(entry.seat ? { seat: entry.seat } : {}),
    ...(entry.scoreAfter ? { scoreAfter: entry.scoreAfter } : {}),
    body: entry.body,
  }
}

function lifecycleRowsForEvent(event: StoredEvent, previous: StoredEvent | undefined): ProtocolArchiveRowDraft[] {
  if (event.type === 'frame.started') {
    return [
      {
        receivedAt: event.receivedAt,
        frameIndex: event.payload.frameIndex,
        source: 'system',
        entryType: 'system-note',
        body: { systemType: 'frame-started', frameIndex: event.payload.frameIndex },
      },
    ]
  }

  if (event.type === 'frame.completed') {
    if (previous?.type === 'game.command' && previous.payload.commandType === 'frame.award') return []

    const conceded = event.payload.outcome.winReason === 'conceded'
    return [
      {
        receivedAt: event.receivedAt,
        frameIndex: event.payload.frameIndex,
        source: 'system',
        entryType: 'system-note',
        seat: conceded ? opponentOf(event.payload.outcome.winnerSeat) : event.payload.outcome.winnerSeat,
        scoreAfter: event.payload.outcome.score,
        body: { systemType: conceded ? 'frame-conceded' : 'frame-completed', winReason: event.payload.outcome.winReason },
      },
    ]
  }

  if (event.type === 'match.ended') {
    return [
      {
        receivedAt: event.receivedAt,
        source: 'system',
        entryType: 'system-note',
        seat: event.payload.winnerSeat,
        body: { systemType: 'match-ended' },
      },
    ]
  }

  return []
}

export function prepareProtocolRowsForArchive(events: StoredEvent[]): ProtocolArchiveRow[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq)
  const drafts = ordered.flatMap((event, eventIndex): ProtocolArchiveRowDraft[] => {
    if (event.type === 'game.command') return event.payload.protocolEntries.map((entry) => rowFromProtocolEntry(event, entry))
    return lifecycleRowsForEvent(event, ordered[eventIndex - 1])
  })

  return drafts.map((row, index) => ({ ...row, rowNo: index + 1 }))
}

export function renderProtocolRows(rows: ProtocolArchiveRow[], seatNames: SeatNames, timeZone: string): ProtocolRow[] {
  return rows.map((row) => ({
    key: `protocol-${row.rowNo}`,
    label: entryLabel(row, seatNames),
    ...(row.scoreAfter ? { score: row.scoreAfter } : {}),
    receivedAt: row.receivedAt,
    timeLabel: new Date(row.receivedAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }),
  }))
}

export function deriveProtocolRows(events: StoredEvent[], seatNames: SeatNames, timeZone: string): ProtocolRow[] {
  return renderProtocolRows(prepareProtocolRowsForArchive(events), seatNames, timeZone)
}

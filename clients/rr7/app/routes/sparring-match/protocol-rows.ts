import { opponentOf, type BySeatNumber, type ProtocolEntry, type Seat, type StoredEvent } from '@ks/core'

type SeatNames = { A: string; B: string }

export type ProtocolRow = {
  key: string
  label: string
  score?: BySeatNumber
  receivedAt: number
}

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

function protocolEntryLabel(entry: ProtocolEntry, seatNames: SeatNames): string {
  const seatLabel = (seat: Seat) => seatNames[seat]
  const actor = entry.seat ? `${seatLabel(entry.seat)}: ` : ''
  const commandType = typeof entry.body.commandType === 'string' ? entry.body.commandType : null

  if (commandType === 'frame.commence') return `${actor}frame commenced`

  if (commandType === 'pot.record') {
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

  if (commandType === 'miss.record') return `${actor}miss`
  if (commandType === 'foul.commit') {
    if (entry.body.penalty === 'opponent-plus-one') return `${actor}foul (opponent +1)`
    if (entry.body.penalty === 'offender-minus-one') return `${actor}foul (offender -1)`
    return `${actor}foul`
  }
  if (commandType === 'penalty.select') {
    if (entry.body.choice === 'play-from-position') return `${actor}play from position`
    if (entry.body.choice === 'pass-position') return `${actor}pass position`
    if (entry.body.choice === 'ball-in-hand') return `${actor}ball in hand`
    return `${actor}penalty selected`
  }
  if (commandType === 'frame.award') return `${actor}frame awarded`

  const systemType = typeof entry.body.systemType === 'string' ? entry.body.systemType : null
  if (systemType === 'automatic-foul') {
    if (entry.body.reason === 'third-consecutive-cue-ball-pot') return 'System: automatic foul (third cue-ball pot)'
    if (entry.body.reason === 'illegal-ball-in-hand-pot') return 'System: automatic foul (illegal ball-in-hand pot)'
    if (entry.body.reason === 'respotted-black-opening-illegal-pot') {
      return 'System: automatic foul (illegal respotted-black opening pot)'
    }
    return 'System: automatic foul'
  }

  if (systemType === 'winner-determined') {
    if (entry.body.reason === 'target-reached') return 'System: winner determined (target reached)'
    if (entry.body.reason === 'foul-forfeit') return 'System: winner determined (foul forfeit)'
    if (entry.body.reason === 'black-ball') return 'System: winner determined (black ball)'
    return 'System: winner determined'
  }

  if (systemType === 'respotted-black-declared') return 'System: respotted black'

  return commandType ?? systemType ?? entry.entryType
}

export function deriveProtocolRows(entries: StoredEvent[], seatNames: SeatNames): ProtocolRow[] {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq)
  const seatLabel = (seat: Seat) => seatNames[seat]

  return ordered.flatMap((event, eventIndex) => {
    if (event.type === 'frame.started') {
      return [
        {
          key: `${event.seq}-${event.eventId}`,
          label: `Frame ${event.payload.frameIndex} started`,
          receivedAt: event.receivedAt,
        },
      ]
    }

    if (event.type === 'game.command') {
      return event.payload.protocolEntries.map((entry, index) => ({
        key: `${event.seq}-${index}-${event.eventId}`,
        label: protocolEntryLabel(entry, seatNames),
        score: entry.scoreAfter,
        receivedAt: event.receivedAt,
      }))
    }

    if (event.type === 'frame.completed') {
      const previous = ordered[eventIndex - 1]
      if (previous?.type === 'game.command' && previous.payload.commandType === 'frame.award') return []

      const winnerLabel = seatLabel(event.payload.outcome.winnerSeat)
      const label =
        event.payload.outcome.winReason === 'conceded'
          ? `${seatLabel(opponentOf(event.payload.outcome.winnerSeat))}: frame conceded`
          : `${winnerLabel}: frame completed`
      return [{ key: `${event.seq}-${event.eventId}`, label, score: event.payload.outcome.score, receivedAt: event.receivedAt }]
    }

    if (event.type === 'match.ended') {
      return [
        {
          key: `${event.seq}-${event.eventId}`,
          label: `${seatLabel(event.payload.winnerSeat)}: match ended`,
          receivedAt: event.receivedAt,
        },
      ]
    }

    return []
  })
}

import { correctionReferenceOf, type ProtocolEntry } from '@ks/competition'
import { type BySeatNumber, type Clock, type Seat } from '@ks/core'
import type { StrilaBall } from '@ks/gameplay/definitions'

type SeatNames = Readonly<{ A: string; B: string }>

export type ProtocolMessage = Readonly<{
  key: string
  actor?: string | undefined
  params?: Readonly<Record<string, string | number>>
  pottedBalls?: readonly StrilaBall[]
}>

type RowTime = Readonly<{ acceptedAtIso: string; acceptedAtLabel: string }>

type RowBase = RowTime & Readonly<{ key: string; frameIndex: number }>

/** What a lane row records, so presentation can style it without parsing copy keys. */
type ProtocolLaneAction =
  | 'frame.commence'
  | 'pot.record'
  | 'miss.record'
  | 'foul.commit'
  | 'penalty.select'
  | 'respotted-black.opening.select'
  | 'frame.concede'

/**
 * One Protocol row in reading order. Player Commands sit in their seat's lane; system outcomes are notes,
 * rack results, frame results, and the match end. Corrections are joined onto the rows they compensate.
 */
export type ProtocolRow =
  | (RowBase &
      Readonly<{
        kind: 'lane'
        seat: Seat
        action: ProtocolLaneAction
        message: ProtocolMessage
        /** Points after this Command; absent when it changed no score or was corrected. */
        score?: BySeatNumber
        /** Seats whose points this Command changed relative to the preceding effective score. */
        changedSeats: readonly Seat[]
        /** Time of the Correction that compensated this Command. */
        corrected?: RowTime
      }>)
  | (RowBase & Readonly<{ kind: 'note'; message: ProtocolMessage }>)
  | (RowBase &
      Readonly<{
        kind: 'rack'
        rackNumber: number
        score: BySeatNumber
        /** From the previous rack's end, or the frame's commencement, to this rack's end. */
        durationMs: number
      }>)
  | (RowBase &
      Readonly<{
        kind: 'frame-result'
        winnerSeat: Seat
        /** Frame wins by seat after this frame, as the Board shows them. */
        framesWonBySeat: BySeatNumber
        /** Final frame points by seat. */
        pointsBySeat: BySeatNumber
        /** From commencement to award. */
        durationMs: number
      }>)
  | (RowBase &
      Readonly<{
        kind: 'match-ended'
        /** Sum of frame durations, excluding the gaps between frames. */
        effectiveDurationMs: number
      }>)

/** Presents the Command that a Last Command Bar names; only player-authored entries reach it. */
export function protocolEntryMessage(entry: ProtocolEntry, seatNames: SeatNames): ProtocolMessage {
  const actor = seatNames[entry.seat]

  if (entry.entryType === 'frame-conceded') return { key: 'match.protocol.system.frame-conceded', actor }

  if (entry.entryType !== 'player-command')
    return { key: 'match.protocol.unknown', params: { value: entry.entryType } }

  switch (entry.body.commandType) {
    case 'frame.commence':
      return { key: 'match.protocol.commands.frame.commence', actor }
    case 'respotted-black.opening.select':
      return { key: 'match.protocol.commands.respotted-black.opening.select', actor }
    case 'pot.record':
      if ('pottedBalls' in entry.body) {
        return { key: 'match.protocol.commands.pot.record.balls', actor, pottedBalls: entry.body.pottedBalls }
      }

      return {
        key: 'match.protocol.commands.pot.record.pottedBallCount',
        actor,
        params: { pottedBallCount: `+${entry.body.pottedBallCount}` },
      }
    case 'miss.record':
      return { key: 'match.protocol.commands.miss.record', actor }
    case 'foul.commit':
      return {
        key: `match.protocol.commands.foul.commit.${'penalty' in entry.body ? entry.body.penalty : 'default'}`,
        actor,
      }
    case 'penalty.select':
      return { key: `match.protocol.commands.penalty.select.${entry.body.choice}`, actor }
    case 'frame.award':
      return { key: 'match.protocol.commands.frame.award', actor }
  }

  throw new Error('Unsupported Protocol player command')
}

/** Projects stored Protocol entries, oldest first, into rows; stored entries stay append-only. */
export function renderProtocolRows(entries: readonly ProtocolEntry[], clock: Clock): ProtocolRow[] {
  const time = (entry: ProtocolEntry): RowTime => {
    const { isoString, time: label } = clock.instantPresentation(entry.acceptedAt)

    return { acceptedAtIso: isoString, acceptedAtLabel: label }
  }

  const corrections = new Map<string, RowTime>()

  for (const entry of entries) {
    const reference = correctionReferenceOf(entry)

    if (reference) corrections.set(entryId(reference.targetSeq, reference.targetEntryIndex), time(entry))
  }

  const rows: ProtocolRow[] = []
  const framesWon = { A: 0, B: 0 }
  let frameIndex = 0
  let previousScore: BySeatNumber = { A: 0, B: 0 }
  let frameStartedAt: number | undefined
  let rackStartedAt: number | undefined
  let effectiveDurationMs = 0

  for (const entry of entries) {
    if (entry.frameIndex !== frameIndex) {
      frameIndex = entry.frameIndex
      previousScore = { A: 0, B: 0 }
      frameStartedAt = undefined
      rackStartedAt = undefined
    }

    const corrected = corrections.get(entryId(entry.acceptedSeq, entry.entryIndex))
    const base = { key: `protocol-${entry.acceptedSeq}-${entry.entryIndex}`, frameIndex, ...time(entry) }
    const changedSeats = entry.scoreAfter ? seatsChanged(previousScore, entry.scoreAfter) : []

    if (entry.scoreAfter) previousScore = entry.scoreAfter

    if (entry.entryType === 'player-command') {
      const body = entry.body

      if (body.commandType === 'frame.commence') {
        frameStartedAt = entry.acceptedAt
        rackStartedAt = entry.acceptedAt
      }

      // The frame-result band replaces the award Command.
      if (body.commandType === 'frame.award') continue

      const lane = {
        ...base,
        kind: 'lane',
        seat: entry.seat,
        action: body.commandType,
        message: laneMessage(body),
        changedSeats: corrected ? [] : changedSeats,
      } as const

      if (corrected) rows.push({ ...lane, corrected })
      else if (entry.scoreAfter) rows.push({ ...lane, score: entry.scoreAfter })
      else rows.push(lane)

      continue
    }

    if (entry.entryType === 'frame-conceded') {
      const concession = {
        ...base,
        kind: 'lane',
        seat: entry.seat,
        action: 'frame.concede',
        message: { key: 'match.protocol.lane.frame-conceded' },
        changedSeats,
      } as const

      // The final points stay in the spine even when no Command scored before the concession.
      rows.push(entry.scoreAfter ? { ...concession, score: entry.scoreAfter } : concession)
      continue
    }

    // A compensated system outcome no longer holds; its player Command remains, struck through.
    if (corrected) continue

    if (entry.entryType === 'system-note') {
      const body = entry.body

      if (body.systemType === 'rack-completed') {
        rows.push({
          ...base,
          kind: 'rack',
          rackNumber: body.rackNumber,
          score: body.scoreBySeat,
          durationMs: entry.acceptedAt - (rackStartedAt ?? entry.acceptedAt),
        })
        rackStartedAt = entry.acceptedAt
        continue
      }

      rows.push({ ...base, kind: 'note', message: systemNoteMessage(body) })
      continue
    }

    switch (entry.entryType) {
      case 'frame-awarded': {
        const durationMs = entry.acceptedAt - (frameStartedAt ?? entry.acceptedAt)

        framesWon[entry.seat] += 1
        effectiveDurationMs += durationMs
        rows.push({
          ...base,
          kind: 'frame-result',
          winnerSeat: entry.seat,
          framesWonBySeat: { ...framesWon },
          pointsBySeat: entry.scoreAfter ?? previousScore,
          durationMs,
        })
        break
      }

      case 'match-ended':
        rows.push({ ...base, kind: 'match-ended', effectiveDurationMs })
        break
      case 'frame-prepared':
      case 'command-corrected':
        break
    }
  }

  return rows
}

type PlayerCommandBody = Extract<ProtocolEntry, { entryType: 'player-command' }>['body']

type SystemNoteBody = Exclude<
  Extract<ProtocolEntry, { entryType: 'system-note' }>['body'],
  { systemType: 'rack-completed' }
>

function laneMessage(body: Exclude<PlayerCommandBody, { commandType: 'frame.award' }>): ProtocolMessage {
  switch (body.commandType) {
    case 'frame.commence':
      return { key: 'match.protocol.lane.frame-commence' }
    case 'respotted-black.opening.select':
      return { key: 'match.protocol.lane.respotted-black-opening' }
    case 'pot.record':
      return 'pottedBalls' in body
        ? { key: 'match.protocol.lane.pot-balls', pottedBalls: body.pottedBalls }
        : { key: 'match.protocol.lane.pot', params: { pottedBallCount: body.pottedBallCount } }
    case 'miss.record':
      return { key: 'match.protocol.lane.miss' }
    case 'foul.commit':
      return { key: 'match.protocol.lane.foul' }
    case 'penalty.select':
      return { key: `match.protocol.lane.penalty.${body.choice}` }
  }

  throw new Error('Unsupported Protocol lane command')
}

function systemNoteMessage(body: SystemNoteBody): ProtocolMessage {
  switch (body.systemType) {
    case 'automatic-foul':
      return { key: `match.protocol.system.automatic-foul.${body.reason}` }
    case 'winner-determined':
      return { key: `match.protocol.system.winner-determined.${body.reason}` }
    case 'respotted-black-declared':
      return { key: 'match.protocol.system.respotted-black-declared' }
  }

  throw new Error('Unsupported Protocol system note')
}

function entryId(acceptedSeq: number, entryIndex: number): string {
  return `${acceptedSeq}-${entryIndex}`
}

function seatsChanged(previous: BySeatNumber, next: BySeatNumber): Seat[] {
  return (['A', 'B'] as const).filter((seat) => previous[seat] !== next[seat])
}

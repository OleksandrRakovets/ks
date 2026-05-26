import invariant from 'tiny-invariant'

import { StrilaProtocolEntrySchema, type StrilaCommand, type StrilaFrameState, type StrilaProtocolEntry } from './definitions'

function isMixedBallInHandPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase === 'foul-committed.ball-in-hand' &&
    command.type === 'pot.record' &&
    command.pottedBalls.includes(0) &&
    command.pottedBalls.some((ball) => ball !== 0)
  )
}

function scoreChanged(previous: StrilaFrameState, next: StrilaFrameState): boolean {
  return previous.score.A !== next.score.A || previous.score.B !== next.score.B
}

function playerEntry(previous: StrilaFrameState, command: StrilaCommand, next: StrilaFrameState): StrilaProtocolEntry {
  const body = (() => {
    switch (command.type) {
      case 'frame.commence':
      case 'miss.record':
      case 'foul.commit':
      case 'frame.award':
        return { commandType: command.type }
      case 'pot.record':
        return { commandType: command.type, pottedBalls: command.pottedBalls }
      case 'penalty.select':
        return { commandType: command.type, choice: command.choice }
    }
  })()

  return StrilaProtocolEntrySchema.parse({
    source: 'player',
    entryType: 'player-command',
    seat: command.seat,
    ...(scoreChanged(previous, next) ? { scoreAfter: next.score } : {}),
    body,
  })
}

function isThirdConsecutiveCueBallPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase === 'open-play' &&
    previous.cueBallSerialPots?.seat === command.seat &&
    previous.cueBallSerialPots.count === 2 &&
    command.type === 'pot.record' &&
    command.pottedBalls.includes(0)
  )
}

function isRespottedBlackOpeningIllegalPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase === 'respotted-black.opening' &&
    command.type === 'pot.record' &&
    !(command.pottedBalls.length === 1 && command.pottedBalls[0] === 7)
  )
}

export function projectStrilaProtocolEntries(args: {
  previous: StrilaFrameState
  command: StrilaCommand
  next: StrilaFrameState
}): StrilaProtocolEntry[] {
  const { previous, command, next } = args

  const entries: StrilaProtocolEntry[] = [playerEntry(previous, command, next)]

  if (previous.phase !== 'respotted-black.opening' && next.phase === 'respotted-black.opening') {
    entries.push(
      StrilaProtocolEntrySchema.parse({
        source: 'system',
        entryType: 'system-note',
        body: { systemType: 'respotted-black-declared' },
      }),
    )
  }

  if (isThirdConsecutiveCueBallPot(previous, command)) {
    entries.push(
      StrilaProtocolEntrySchema.parse({
        source: 'system',
        entryType: 'system-note',
        seat: command.seat,
        body: { systemType: 'automatic-foul', reason: 'third-consecutive-cue-ball-pot' },
      }),
    )
  }

  if (isMixedBallInHandPot(previous, command)) {
    entries.push(
      StrilaProtocolEntrySchema.parse({
        source: 'system',
        entryType: 'system-note',
        seat: command.seat,
        body: { systemType: 'automatic-foul', reason: 'illegal-ball-in-hand-pot' },
      }),
    )
  }

  if (isRespottedBlackOpeningIllegalPot(previous, command)) {
    entries.push(
      StrilaProtocolEntrySchema.parse({
        source: 'system',
        entryType: 'system-note',
        seat: command.seat,
        body: { systemType: 'automatic-foul', reason: 'respotted-black-opening-illegal-pot' },
      }),
    )
  }

  if (previous.phase !== 'winner-determined' && next.phase === 'winner-determined') {
    invariant(next.winner !== null, 'Winner is required when protocol records winner determination')
    invariant(next.winReason !== null, 'Win reason is required when protocol records winner determination')
    entries.push(
      StrilaProtocolEntrySchema.parse({
        source: 'system',
        entryType: 'system-note',
        seat: next.winner,
        body: { systemType: 'winner-determined', reason: next.winReason },
      }),
    )
  }

  return entries
}

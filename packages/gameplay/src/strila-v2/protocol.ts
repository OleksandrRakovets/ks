import invariant from 'tiny-invariant'
import * as v from 'valibot'

import { type StrilaCommand, StrilaProtocolEntry } from './definitions'
import { getPhase, type StrilaSparringFrameSnapshot } from './machine'

function isMixedBallInHandPot(previous: StrilaSparringFrameSnapshot, command: StrilaCommand): boolean {
  return (
    getPhase(previous) === 'foul-committed.ball-in-hand' &&
    command.type === 'pot.record' &&
    command.pottedBalls.includes(0) &&
    command.pottedBalls.some((ball) => ball !== 0)
  )
}

function scoreChanged(previous: StrilaSparringFrameSnapshot, next: StrilaSparringFrameSnapshot): boolean {
  return previous.context.score.A !== next.context.score.A || previous.context.score.B !== next.context.score.B
}

function playerEntry(
  previous: StrilaSparringFrameSnapshot,
  command: StrilaCommand,
  next: StrilaSparringFrameSnapshot,
): StrilaProtocolEntry {
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

  return v.parse(StrilaProtocolEntry, {
    gameKey: 'strila-v2',
    source: 'player',
    entryType: 'player-command',
    seat: command.seat,
    scoreAfter: scoreChanged(previous, next) ? { ...next.context.score } : undefined,
    body,
  })
}

function isThirdConsecutiveCueBallPot(previous: StrilaSparringFrameSnapshot, command: StrilaCommand): boolean {
  return (
    getPhase(previous) === 'open-play' &&
    previous.context.cueBallSerialPots?.seat === command.seat &&
    previous.context.cueBallSerialPots.count === 2 &&
    command.type === 'pot.record' &&
    command.pottedBalls.includes(0)
  )
}

function isRespottedBlackOpeningIllegalPot(
  previous: StrilaSparringFrameSnapshot,
  command: StrilaCommand,
): boolean {
  return (
    getPhase(previous) === 'respotted-black.opening' &&
    command.type === 'pot.record' &&
    !(command.pottedBalls.length === 1 && command.pottedBalls[0] === 7)
  )
}

export function createStrilaProtocolEntries(args: {
  readonly previous: StrilaSparringFrameSnapshot
  readonly command: StrilaCommand
  readonly next: StrilaSparringFrameSnapshot
}): [StrilaProtocolEntry, ...StrilaProtocolEntry[]] {
  const { previous, command, next } = args

  const entries: [StrilaProtocolEntry, ...StrilaProtocolEntry[]] = [playerEntry(previous, command, next)]

  if (getPhase(previous) !== 'respotted-black.opening' && getPhase(next) === 'respotted-black.opening') {
    entries.push(
      v.parse(StrilaProtocolEntry, {
        gameKey: 'strila-v2',
        source: 'system',
        entryType: 'system-note',
        seat: command.seat,
        body: { systemType: 'respotted-black-declared' },
      }),
    )
  }

  if (isThirdConsecutiveCueBallPot(previous, command)) {
    entries.push(
      v.parse(StrilaProtocolEntry, {
        gameKey: 'strila-v2',
        source: 'system',
        entryType: 'system-note',
        seat: command.seat,
        body: { systemType: 'automatic-foul', reason: 'third-consecutive-cue-ball-pot' },
      }),
    )
  }

  if (isMixedBallInHandPot(previous, command)) {
    entries.push(
      v.parse(StrilaProtocolEntry, {
        gameKey: 'strila-v2',
        source: 'system',
        entryType: 'system-note',
        seat: command.seat,
        body: { systemType: 'automatic-foul', reason: 'illegal-ball-in-hand-pot' },
      }),
    )
  }

  if (isRespottedBlackOpeningIllegalPot(previous, command)) {
    entries.push(
      v.parse(StrilaProtocolEntry, {
        gameKey: 'strila-v2',
        source: 'system',
        entryType: 'system-note',
        seat: command.seat,
        body: { systemType: 'automatic-foul', reason: 'respotted-black-opening-illegal-pot' },
      }),
    )
  }

  if (getPhase(previous) !== 'winner-determined' && getPhase(next) === 'winner-determined') {
    invariant(next.context.winner !== null, 'Winner is required when protocol records winner determination')
    invariant(
      next.context.winnerDeterminationReason !== null,
      'Winner determination reason is required when protocol records winner determination',
    )
    entries.push(
      v.parse(StrilaProtocolEntry, {
        gameKey: 'strila-v2',
        source: 'system',
        entryType: 'system-note',
        seat: next.context.winner,
        body: { systemType: 'winner-determined', reason: next.context.winnerDeterminationReason },
      }),
    )
  }

  return entries
}

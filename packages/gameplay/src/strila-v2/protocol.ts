import invariant from 'tiny-invariant'

import { StrilaProtocolEntrySchema, type StrilaCommand, type StrilaFrameState, type StrilaProtocolEntry } from './definitions'

function hasActor(command: StrilaCommand): command is Exclude<StrilaCommand, { type: 'frame.commence' }> {
  return command.type !== 'frame.commence'
}

function isMixedBallInHandPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase === 'foul-committed.ball-in-hand' &&
    command.type === 'pot.record' &&
    command.pottedBalls.includes(0) &&
    command.pottedBalls.some((ball) => ball !== 0)
  )
}

function isThirdConsecutiveCueBallPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase === 'open-play' &&
    previous.cueBallSerialPots?.seat === command.actor &&
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

  const entries: StrilaProtocolEntry[] = [{ source: 'player', command }]

  if (previous.phase !== 'respotted-black.opening' && next.phase === 'respotted-black.opening') {
    entries.push({ source: 'system', systemType: 'respotted-black-declared' })
  }

  if (isThirdConsecutiveCueBallPot(previous, command)) {
    if (!hasActor(command)) return entries.map((entry) => StrilaProtocolEntrySchema.parse(entry))
    entries.push({
      source: 'system',
      systemType: 'automatic-foul',
      offender: command.actor,
      reason: 'third-consecutive-cue-ball-pot',
    })
  }

  if (isMixedBallInHandPot(previous, command)) {
    if (!hasActor(command)) return entries.map((entry) => StrilaProtocolEntrySchema.parse(entry))
    entries.push({
      source: 'system',
      systemType: 'automatic-foul',
      offender: command.actor,
      reason: 'illegal-ball-in-hand-pot',
    })
  }

  if (isRespottedBlackOpeningIllegalPot(previous, command)) {
    if (!hasActor(command)) return entries.map((entry) => StrilaProtocolEntrySchema.parse(entry))
    entries.push({
      source: 'system',
      systemType: 'automatic-foul',
      offender: command.actor,
      reason: 'respotted-black-opening-illegal-pot',
    })
  }

  if (previous.phase !== 'winner-determined' && next.phase === 'winner-determined') {
    invariant(next.winner !== null, 'Winner is required when protocol records winner determination')
    invariant(next.winReason !== null, 'Win reason is required when protocol records winner determination')
    entries.push({
      source: 'system',
      systemType: 'winner-determined',
      winner: next.winner,
      reason: next.winReason,
    })
  }

  return entries.map((entry) => StrilaProtocolEntrySchema.parse(entry))
}

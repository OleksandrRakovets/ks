import { StrilaProtocolEntrySchema, type StrilaCommand, type StrilaFrameState, type StrilaProtocolEntry } from './definitions'

function hasActor(command: StrilaCommand): command is Exclude<StrilaCommand, { type: 'frame.commence' }> {
  return command.type !== 'frame.commence'
}

function isMixedBallInHandPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase.type === 'ball-in-hand' &&
    command.type === 'pot.record' &&
    command.pottedBalls.includes(0) &&
    command.pottedBalls.some((ball) => ball !== 0)
  )
}

function isThirdConsecutiveCueBallPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase.type === 'open-play' &&
    previous.phase.cueBallPotsInRun === 2 &&
    command.type === 'pot.record' &&
    command.pottedBalls.includes(0)
  )
}

function isRespottedBlackOpeningIllegalPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase.type === 'respotted-black-opening' &&
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

  if (previous.phase.type !== 'respotted-black-opening' && next.phase.type === 'respotted-black-opening') {
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

  if (previous.phase.type !== 'winner-determined' && next.phase.type === 'winner-determined') {
    entries.push({
      source: 'system',
      systemType: 'winner-determined',
      winner: next.phase.winner,
      reason: next.phase.reason,
    })
  }

  return entries.map((entry) => StrilaProtocolEntrySchema.parse(entry))
}

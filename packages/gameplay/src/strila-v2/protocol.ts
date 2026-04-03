import {
  StrilaProtocolEntrySchema,
  type StrilaCommand,
  type StrilaFrameState,
  type StrilaProtocolEntry,
  type StrilaSeat,
} from './definitions'

function opponentOf(seat: StrilaSeat): StrilaSeat {
  return seat === 'A' ? 'B' : 'A'
}

function hasActor(command: StrilaCommand): command is Exclude<StrilaCommand, { type: 'break-off' }> {
  return command.type !== 'break-off'
}

function isMixedBallInHandPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase.type === 'opponent-foul-ball-in-hand' &&
    command.type === 'record-pot' &&
    command.pottedBalls.includes(0) &&
    command.pottedBalls.some((ball) => ball !== 0)
  )
}

function isThirdConsecutiveCueBallPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return (
    previous.phase.type === 'open-play' &&
    previous.phase.cueBallPotsInRun === 2 &&
    command.type === 'record-pot' &&
    command.pottedBalls.includes(0)
  )
}

function isRespottedBlackOpeningIllegalPot(previous: StrilaFrameState, command: StrilaCommand): boolean {
  return previous.phase.type === 'respotted-black-opening' && command.type === 'record-pot' && !(command.pottedBalls.length === 1 && command.pottedBalls[0] === 7)
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
      reason: 'illegal-opponent-foul-ball-in-hand-pot',
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

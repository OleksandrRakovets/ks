import { type ControlCommandPreset, type ControlCommandSections, emptyControlCommandSections, type Seat } from '@ks/core'

import type { MatchState } from './match-state'

export type GameControlContribution = {
  phase: string
  commandSections: ControlCommandSections
}

export function deriveSparringControlSections(args: {
  matchState: MatchState
  gameControl?: GameControlContribution
}): ControlCommandSections {
  return mergeControlCommandSections(
    deriveSparringMatchControlSections(args.matchState, args.gameControl?.phase),
    args.gameControl?.commandSections,
  )
}

function deriveSparringMatchControlSections(matchState: MatchState, gamePhase?: string): ControlCommandSections {
  const currentFrame = matchState.frames[matchState.frames.length - 1]
  const winnerSeat = currentFrame?.winnerSeat
  const matchTargetFrames = matchState.config?.targets.matchTargetFrames
  const isMatchTargetReached =
    matchTargetFrames != null &&
    (matchState.framesWonBySeat.A >= matchTargetFrames || matchState.framesWonBySeat.B >= matchTargetFrames)
  const sections = emptyControlCommandSections()

  if (matchState.status === 'active' && currentFrame && !winnerSeat && gamePhase === 'not-started') {
    sections.primary[currentFrame.breakerSeat].push({
      source: 'match',
      commandType: 'frame.commence',
      command: { seat: currentFrame.breakerSeat },
      seat: currentFrame.breakerSeat,
      prominence: 'primary',
    })
  }

  if (matchState.status === 'active' && currentFrame && !winnerSeat && gamePhase !== 'not-started') {
    sections.tertiary.A.push(concedeFrameCommand('A'))
    sections.tertiary.B.push(concedeFrameCommand('B'))
  }

  if (matchState.status === 'active' && winnerSeat && !isMatchTargetReached) {
    sections.neutral.push({
      source: 'match',
      commandType: 'frame.start',
      command: {},
      prominence: 'secondary',
    })
  }

  if (matchState.status === 'active' && winnerSeat && isMatchTargetReached) {
    sections.neutral.push({
      source: 'match',
      commandType: 'match.end',
      command: {},
      prominence: 'secondary',
    })
  }

  return sections
}

function concedeFrameCommand(seat: Seat): ControlCommandPreset {
  return {
    source: 'match',
    commandType: 'frame.concede',
    command: { seat },
    seat,
    prominence: 'tertiary',
  }
}

function mergeControlCommandSections(
  matchSections: ControlCommandSections,
  gameSections?: ControlCommandSections,
): ControlCommandSections {
  const sections = emptyControlCommandSections()
  sections.neutral = [...matchSections.neutral, ...(gameSections?.neutral ?? [])]

  for (const prominence of ['primary', 'secondary', 'tertiary'] as const) {
    for (const bucket of ['A', 'B'] as const) {
      sections[prominence][bucket] = [...matchSections[prominence][bucket], ...(gameSections?.[prominence][bucket] ?? [])]
    }
  }

  return sections
}

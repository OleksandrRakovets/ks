import { emptyControlCommandSections, type ControlCommandSections } from '@ks/core'

import type { MatchState } from './match-state'

export function deriveSparringMatchControlSections(matchState: MatchState): ControlCommandSections {
  const currentFrame = matchState.frames[matchState.frames.length - 1]
  const winnerSeat = currentFrame?.winnerSeat
  const matchTargetFrames = matchState.config?.targets.matchTargetFrames
  const isMatchTargetReached =
    matchTargetFrames != null &&
    (matchState.framesWonBySeat.A >= matchTargetFrames || matchState.framesWonBySeat.B >= matchTargetFrames)
  const sections = emptyControlCommandSections()

  if (matchState.status === 'active' && winnerSeat && !isMatchTargetReached) {
    sections.secondary.neutral.push({
      source: 'match',
      commandType: 'frame.start',
      command: {},
      label: 'Start next frame',
      prominence: 'secondary',
    })
  }

  if (matchState.status === 'active' && winnerSeat && isMatchTargetReached) {
    sections.secondary.neutral.push({
      source: 'match',
      commandType: 'match.end',
      command: {},
      label: 'End match',
      prominence: 'secondary',
    })
  }

  return sections
}

export function mergeControlCommandSections(
  matchSections: ControlCommandSections,
  gameSections?: ControlCommandSections,
): ControlCommandSections {
  const sections = emptyControlCommandSections()

  for (const prominence of ['primary', 'secondary', 'tertiary'] as const) {
    for (const bucket of ['neutral', 'A', 'B'] as const) {
      sections[prominence][bucket] = [...matchSections[prominence][bucket], ...(gameSections?.[prominence][bucket] ?? [])]
    }
  }

  return sections
}

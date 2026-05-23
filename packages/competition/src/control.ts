import { emptyControlCommandSections, type ControlCommandSections, type MatchSnapshot } from '@ks/core'

export type MatchLifecycleDecisions = {
  isMatchTargetReached: boolean
  canStartNextFrame: boolean
  canEndMatch: boolean
}

export function deriveMatchLifecycleDecisions(snapshot: MatchSnapshot): MatchLifecycleDecisions {
  const currentFrame = snapshot.frames[snapshot.frames.length - 1]
  const winnerSeat = currentFrame?.winnerSeat
  const isActive = snapshot.status === 'active'

  const framesWonA = snapshot.framesWonBySeat.A
  const framesWonB = snapshot.framesWonBySeat.B
  const targetFrames = snapshot.targets.matchTargetFrames
  const isMatchTargetReached = framesWonA >= targetFrames || framesWonB >= targetFrames

  return {
    isMatchTargetReached,
    canStartNextFrame: isActive && Boolean(winnerSeat) && !isMatchTargetReached,
    canEndMatch: isActive && Boolean(winnerSeat) && isMatchTargetReached,
  }
}

export function deriveSparringMatchControlSections(snapshot: MatchSnapshot): ControlCommandSections {
  const decisions = deriveMatchLifecycleDecisions(snapshot)
  const sections = emptyControlCommandSections()

  if (decisions.canStartNextFrame) {
    sections.secondary.neutral.push({
      source: 'match',
      commandType: 'frame.start',
      command: {},
      label: 'Start next frame',
      prominence: 'secondary',
    })
  }

  if (decisions.canEndMatch) {
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

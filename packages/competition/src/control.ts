import {
  ControlCommandSectionsSchema,
  emptyControlCommandSections,
  type ControlCommandPreset,
  type ControlCommandSections,
  type Seat,
} from '@ks/core'
import * as v from 'valibot'

import type { MatchState } from './match-state'

export function deriveSparringControlSections(args: {
  matchState: MatchState
  gameControlProjection?: unknown
}): ControlCommandSections {
  const gameSections = extractGameControlSections(args.gameControlProjection)
  return mergeControlCommandSections(deriveSparringMatchControlSections(args.matchState), gameSections)
}

function extractGameControlSections(gameControlProjection: unknown): ControlCommandSections | undefined {
  if (typeof gameControlProjection !== 'object' || gameControlProjection === null || !('details' in gameControlProjection)) {
    return undefined
  }

  const details = gameControlProjection.details
  if (typeof details !== 'object' || details === null || !('commandSections' in details)) return undefined

  const parsed = v.safeParse(ControlCommandSectionsSchema, details.commandSections)
  return parsed.success ? parsed.output : undefined
}

function deriveSparringMatchControlSections(matchState: MatchState): ControlCommandSections {
  const currentFrame = matchState.frames[matchState.frames.length - 1]
  const winnerSeat = currentFrame?.winnerSeat
  const matchTargetFrames = matchState.config?.targets.matchTargetFrames
  const isMatchTargetReached =
    matchTargetFrames != null &&
    (matchState.framesWonBySeat.A >= matchTargetFrames || matchState.framesWonBySeat.B >= matchTargetFrames)
  const sections = emptyControlCommandSections()

  if (matchState.status === 'active' && currentFrame && !winnerSeat) {
    sections.tertiary.A.push(concedeFrameCommand('A'))
    sections.tertiary.B.push(concedeFrameCommand('B'))
  }

  if (matchState.status === 'active' && winnerSeat && !isMatchTargetReached) {
    sections.neutral.push({
      source: 'match',
      commandType: 'frame.start',
      command: {},
      label: 'Start next frame',
      prominence: 'secondary',
    })
  }

  if (matchState.status === 'active' && winnerSeat && isMatchTargetReached) {
    sections.neutral.push({
      source: 'match',
      commandType: 'match.end',
      command: {},
      label: 'End match',
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
    label: 'Concede frame',
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

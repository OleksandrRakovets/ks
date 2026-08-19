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
  return mergeControlCommandSections(
    deriveSparringMatchControlSections(args.matchState, extractGamePhase(args.gameControlProjection)),
    gameSections,
  )
}

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof -- SAFETY: REVIEW_POST_REFACTOR */
function extractGamePhase(gameControlProjection: unknown): string | undefined {
  if (typeof gameControlProjection !== 'object' || gameControlProjection === null || !('details' in gameControlProjection)) {
    return undefined
  }
  const details = gameControlProjection.details
  if (typeof details !== 'object' || details === null || !('phase' in details)) return undefined
  return typeof details.phase === 'string' ? details.phase : undefined
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
/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof */

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

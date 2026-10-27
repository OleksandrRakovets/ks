import type { ReadMatchResult } from '@ks/application'
import { type GameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

import type { ScoreboardMatchValues, ScoreboardSize } from '@/features/scoreboard/values'

export type MatchRead = Extract<ReadMatchResult<GameKey>, { ok: true }>

/**
 * One per gameplay machine (`strila-v2`, `pyramid`, `long-free-pyramid`): what its games show that
 * the others do not. Names, points, and the winner are shared and resolved by `presentScoreboard`.
 */
export type ScoreboardPresenter = Readonly<{
  size: (gameKey: GameKey) => ScoreboardSize
  present: (
    read: MatchRead,
    t: TFunction,
  ) => Pick<ScoreboardMatchValues, 'targets' | 'centre' | 'balls' | 'tips'>
}>

export const NO_TIPS = { A: null, B: null } as const

/** A frame can end on a pot past its target, so allow points up to twice the largest setup target. */
export function pointDigits(gameKey: GameKey) {
  return String(2 * registry[gameKey].meta.maxFrameTargetPoints).length
}

/** Setup allows races up to 20 frames. */
export const FRAMES_CENTRE_SIZE = { kind: 'frames', digits: 2 } as const

/** Frames won around the race; frames won never exceed it. */
export function framesCentre(read: MatchRead) {
  return { kind: 'frames', ...read.framesWonBySeat, race: read.targets.matchTargetFrames } as const
}

/** A frame race shows both targets, labelled as a handicap, whenever the pair is not the game's default. */
export function handicapTargets(read: MatchRead, t: TFunction): ScoreboardMatchValues['targets'] {
  const defaults = registry[read.gameKey].meta.defaultFrameTargetPointsBySeat
  const configured = read.targets.frameTargetPointsBySeat

  return configured.A === defaults.A && configured.B === defaults.B
    ? null
    : { ...configured, label: t(keys.scoreboard.handicap) }
}

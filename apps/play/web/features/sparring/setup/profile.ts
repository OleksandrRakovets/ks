import type { BySeatNumber } from '@ks/core'
import { type GameKey, registry } from '@ks/gameplay/definitions'

export type RackRolloverOption = 14 | 15

export type MatchCreateProfile = {
  gameKey: GameKey
  defaultFrameTargetPointsBySeat: BySeatNumber
  maxFrameTargetPoints: number
  matchTargetFrames:
    | { mode: 'editable'; defaultValue: number; maxValue: number }
    | { mode: 'fixed'; fixedValue: number }
  rackRollover?: {
    defaultValue: RackRolloverOption
    options: RackRolloverOption[]
  }
}

export function createProfileForGame(gameKey: GameKey): MatchCreateProfile {
  const { defaultFrameTargetPointsBySeat, maxFrameTargetPoints } = registry[gameKey].meta

  if (gameKey === 'free-pyramid-long') {
    return {
      gameKey,
      defaultFrameTargetPointsBySeat,
      maxFrameTargetPoints,
      matchTargetFrames: {
        mode: 'fixed',
        fixedValue: 1,
      },
      rackRollover: {
        defaultValue: 14,
        options: [14, 15],
      },
    }
  }

  return {
    gameKey,
    defaultFrameTargetPointsBySeat,
    maxFrameTargetPoints,
    matchTargetFrames: { mode: 'editable', defaultValue: 3, maxValue: 20 },
  }
}

import type { BySeatNumber } from '@ks/core'
import { registry, type RegisteredGameKey } from '@ks/gameplay/definitions'

export type RackRolloverOption = 14 | 15

export type MatchCreateProfile = {
  gameKey: RegisteredGameKey
  defaultFrameTargetPointsBySeat: BySeatNumber
  matchTargetFrames: { mode: 'editable'; defaultValue: number } | { mode: 'fixed'; fixedValue: number }
  rackRollover?: {
    defaultValue: RackRolloverOption
    options: RackRolloverOption[]
  }
}

export function createProfileForGame(gameKey: RegisteredGameKey): MatchCreateProfile {
  const defaultFrameTargetPointsBySeat = registry[gameKey].meta.defaultFrameTargetPointsBySeat

  if (gameKey === 'free-pyramid-long') {
    return {
      gameKey,
      defaultFrameTargetPointsBySeat,
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
    matchTargetFrames: { mode: 'editable', defaultValue: 3 },
  }
}

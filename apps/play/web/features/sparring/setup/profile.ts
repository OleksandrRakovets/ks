import type { BySeatNumber } from '@ks/core'
import { type GameKey, registry } from '@ks/gameplay/definitions'

export type RackRolloverOption = 14 | 15

export type MatchCreateProfile = {
  gameKey: GameKey
  defaultFrameTargetPointsBySeat: BySeatNumber
  matchTargetFrames: { mode: 'editable'; defaultValue: number } | { mode: 'fixed'; fixedValue: number }
  rackRollover?: {
    defaultValue: RackRolloverOption
    options: RackRolloverOption[]
  }
}

export function createProfileForGame(gameKey: GameKey): MatchCreateProfile {
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

import type { BySeatNumber } from '@ks/core'
import { registry, type RegisteredGameKey } from '@ks/gameplay/definitions'

export type RackRolloverOption = 14 | 15

export type MatchCreateProfile = {
  gameKey: RegisteredGameKey
  defaultFrameTargetPointsBySeat: BySeatNumber
  matchTargetFrames: { mode: 'editable'; defaultValue: number } | { mode: 'fixed'; fixedValue: number; helpText: string }
  rackRollover?: {
    defaultValue: RackRolloverOption
    options: { value: RackRolloverOption; label: string; helpText: string }[]
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
        helpText: 'Long Free Pyramid is tracked as one app frame; physical racks roll over inside it.',
      },
      rackRollover: {
        defaultValue: 14,
        options: [
          { value: 14, label: '14 balls', helpText: 'Preferred club rule' },
          { value: 15, label: '15 balls', helpText: 'Newer club rule' },
        ],
      },
    }
  }

  return {
    gameKey,
    defaultFrameTargetPointsBySeat,
    matchTargetFrames: { mode: 'editable', defaultValue: 3 },
  }
}
